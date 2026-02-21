import whisper
import numpy as np
import io
import tempfile
import os
import time
import threading
from datetime import datetime
from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_socketio import SocketIO, emit
from pydub import AudioSegment

# Try to load faster-whisper if available, otherwise fall back to OpenAI/whisper
use_faster_whisper = False
fw_model = None
try:
    from faster_whisper import WhisperModel
    print("🔄 Loading faster-whisper model...")
    # Use float32 on CPU for compatibility; change compute_type if you have GPU/quantized builds
    fw_model = WhisperModel("small.en", device="cpu", compute_type="float32")
    use_faster_whisper = True
    print("✅ faster-whisper model loaded successfully!")
except Exception as e:
    print(f"ℹ️ faster-whisper not available or failed to load: {e}. Falling back to whisper package.")
    print("🔄 Loading Whisper model...")
    whisper_model = whisper.load_model("small.en","cpu")
    print("✅ Whisper model loaded successfully!")

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})  # Enable CORS for frontend requests
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

# Configuration
AUDIO_BUFFER_THRESHOLD_BYTES = 80000  # ~5 seconds at 16kHz
AUDIO_BUFFER_MAX_SIZE = 1000000  # 1MB max per chunk
BUFFER_CLEANUP_INTERVAL_SEC = 60  # Check every minute
BUFFER_STALE_TIMEOUT_SEC = 300  # 5 minutes
# Silence detection thresholds (tune to your microphone/environment)
SILENCE_RMS_THRESHOLD = 300  # RMS below this is considered silence / too quiet
SILENCE_MIN_DURATION_MS = 400  # Minimum duration to consider for transcription

def transcribe_audio(audio_buffer, is_wav_format=False, language="en"):
    """
    Transcribe audio using Whisper model.
    
    Args:
        audio_buffer: BytesIO containing audio data
        is_wav_format: If True, skip format conversion (already 16kHz mono WAV)
    
    Returns:
        str: Transcribed text or empty string if silence/noise
    """
    print("🔊 Processing audio file...")
    
    # Save uploaded audio to temp file
    raw_bytes = audio_buffer.read()
    print(f"📦 Raw input: {len(raw_bytes)} bytes, format: {'WAV (pre-converted)' if is_wav_format else 'WebM (needs conversion)'} | requested language: {language}")
    
    if is_wav_format:
        # Audio is already in WAV format (16kHz mono) - skip conversion!
        print("⚡ Using pre-converted WAV audio (skipping pydub conversion)")
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as temp_wav:
            temp_wav.write(raw_bytes)
            temp_wav_path = temp_wav.name
        
        try:
            # Quick validation: check WAV header
            audio = AudioSegment.from_wav(io.BytesIO(raw_bytes))
            print(f"📊 WAV audio: {len(audio)}ms, {audio.frame_rate}Hz, {audio.channels}ch, RMS={audio.rms}")
            
            # Check if audio is too quiet (likely silence)
            if audio.rms < SILENCE_RMS_THRESHOLD:
                print(f"⚠️ Audio too quiet (RMS={audio.rms}) - likely silence, skipping transcription")
                os.unlink(temp_wav_path)
                return ""

            # Check if audio is too short
            if len(audio) < SILENCE_MIN_DURATION_MS:
                print(f"⚠️ Audio too short ({len(audio)}ms) - skipping transcription")
                os.unlink(temp_wav_path)
                return ""
        
        except Exception as e:
            print(f"⚠️ WAV validation error: {e}, proceeding with transcription anyway")
    
    else:
        # WebM format - needs conversion
        with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as temp_input:
            temp_input.write(raw_bytes)
            temp_input_path = temp_input.name
        
        try:
            # Convert any audio format to WAV using pydub
            print("🔁 Converting audio to WAV format...")
            try:
                audio = AudioSegment.from_file(temp_input_path)
            except Exception as e:
                raise RuntimeError(
                    "Failed to decode audio. Ensure ffmpeg is installed and available in PATH. "
                    f"Original error: {e}"
                )

            print(f"📊 Input audio: {len(audio)}ms, {audio.frame_rate}Hz, {audio.channels}ch, {audio.sample_width}bytes, RMS={audio.rms}, Max={audio.max}")

            # Export as WAV with 16kHz mono (Whisper's required format)
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as temp_wav:
                temp_wav_path = temp_wav.name

            audio = audio.set_frame_rate(16000).set_channels(1)
            audio.export(temp_wav_path, format="wav")
            print(f"✅ Audio converted: {len(audio)}ms, 16000Hz, mono, RMS={audio.rms}")

            # Check if audio is too quiet (likely silence)
            if audio.rms < SILENCE_RMS_THRESHOLD:
                print(f"⚠️ Audio too quiet (RMS={audio.rms}) - likely silence, skipping transcription")
                os.unlink(temp_input_path)
                os.unlink(temp_wav_path)
                return ""

            # Check if audio is too short
            if len(audio) < SILENCE_MIN_DURATION_MS:
                print(f"⚠️ Audio too short ({len(audio)}ms) - skipping transcription")
                os.unlink(temp_input_path)
                os.unlink(temp_wav_path)
                return ""
        
        finally:
            # Clean up input file
            if os.path.exists(temp_input_path):
                os.unlink(temp_input_path)

    try:
        # Load audio - if faster-whisper is available use it (it can consume the WAV file directly)
        print("🎵 Loading audio for transcription...")

        # Normalize language to short code (e.g., en-US -> en) for Whisper API
        language_short = (language.split("-")[0] if language else "en").lower()

        if use_faster_whisper and fw_model is not None:
            try:
                print("⚡ Using faster-whisper for transcription (file path) ...")
                # faster-whisper returns (segments, info)
                segments, info = fw_model.transcribe(temp_wav_path, beam_size=5, language=language_short)
                transcript = "".join([seg.text for seg in segments]).strip()
                print(f"📝 Raw transcript (faster-whisper): '{transcript}'")
            except Exception as e:
                print(f"⚠️ faster-whisper transcription failed: {e}. Falling back to whisper package.")
                # fallback to whisper package path below
                # Ensure the whisper package model is loaded for fallback (lazy-load)
                if 'whisper_model' not in globals() or whisper_model is None:
                    try:
                        print("🔄 Loading Whisper model for fallback...")
                        whisper_model = whisper.load_model("small.en", "cpu")
                        print("✅ Whisper model loaded successfully (fallback).")
                    except Exception as inner_e:
                        print(f"❌ Failed to load fallback Whisper model: {inner_e}")
                        raise
                audio_np = whisper.load_audio(temp_wav_path)
                audio_np = whisper.pad_or_trim(audio_np)
                print(f"🔢 Audio array shape: {audio_np.shape}, dtype: {audio_np.dtype}")
                print("🎵 Generating mel spectrogram...")
                mel = whisper.log_mel_spectrogram(audio_np).to(whisper_model.device)
                print("🤖 Running Whisper model (fallback)...")
                options = whisper.DecodingOptions(language=language_short, fp16=False)
                result = whisper.decode(whisper_model, mel, options)
                transcript = result.text.strip()
                print(f"📝 Raw transcript (whisper fallback): '{transcript}'")
        else:
            # Use original whisper package flow
            audio_np = whisper.load_audio(temp_wav_path)
            # Whisper.load_audio already returns 16kHz float32, just trim/pad
            audio_np = whisper.pad_or_trim(audio_np)
            print(f"🔢 Audio array shape: {audio_np.shape}, dtype: {audio_np.dtype}, min: {audio_np.min():.4f}, max: {audio_np.max():.4f}, mean: {np.abs(audio_np).mean():.4f}")

            print("🎵 Generating mel spectrogram...")
            mel = whisper.log_mel_spectrogram(audio_np).to(whisper_model.device)

            print("🤖 Running Whisper model...")
            options = whisper.DecodingOptions(language=language_short, fp16=False)
            result = whisper.decode(whisper_model, mel, options)

            transcript = result.text.strip()
            print(f"📝 Raw transcript: '{transcript}'")

        # Check if transcription seems like noise/hallucination
        noise_phrases = [
            "thank you", "thanks for watching", "i'm sorry", "bye", "you", "i", "and", "the", "a",
            "thank you for watching", "thanks for", "bye bye", 
            "open up for now", "you know", "so", "um", "uh",  # Common silence hallucinations
            "the end", "okay", "yeah", "right", "see you"
        ]
        
        is_likely_noise = (
            len(transcript) < 3 or  # Very short
            transcript.lower().strip() in noise_phrases or  # Common hallucinations
            len(transcript.split()) == 1 and len(transcript) < 5 or  # Single very short word
            # Check if it's a partial match of common phrases
            any(phrase in transcript.lower() for phrase in ["thank you for", "thanks for watching", "open up for"])
        )

        if is_likely_noise:
            print(f"⚠️ Warning: Transcription appears to be noise/hallucination - returning empty")
            return ""  # Return empty string instead of hallucination

        return transcript
    
    finally:
        # Clean up temp file
        if 'temp_wav_path' in locals() and os.path.exists(temp_wav_path):
            os.unlink(temp_wav_path)

@app.route('/api/whisper-transcribe', methods=['POST'])
def whisper_transcribe():
    print("📥 Received transcription request")
    
    if 'audio' not in request.files:
        print("❌ No audio file in request")
        return jsonify({'error': 'No audio file provided'}), 400
    
    audio_file = request.files['audio']
    print(f"📁 Audio file received: {audio_file.filename}, size: {audio_file.content_length} bytes")
    
    wav_buffer = io.BytesIO(audio_file.read())
    # Optional language parameter (form field)
    lang = request.form.get('language') or request.args.get('language') or 'en-US'
    print(f"📚 Requested language: {lang}")
    
    try:
        print("🎯 Starting transcription...")
        # Map locale to short language code inside transcribe_audio
        transcript = transcribe_audio(wav_buffer, language=lang)
        print(f"✅ Transcription complete: '{transcript}'")
        return jsonify({'transcript': transcript})
    except Exception as e:
        print(f"❌ Transcription error: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/parse', methods=['POST'])
@app.route('/api/parse', methods=['POST'])
def parse_command():
    """NLP endpoint - processes voice commands and returns actions"""
    try:
        from utils.enhanced_command_router import get_intent_and_entities, route_command
    except ImportError as e:
        print(f"❌ Import error: {e}")
        return jsonify({
            'status': 'error',
            'message': 'NLP module not available. Install spacy: pip install spacy && python -m spacy download en_core_web_sm'
        }), 500
    
    data = request.json
    text = data.get('text', '')
    
    if not text:
        return jsonify({'status': 'error', 'message': 'No text provided'}), 400
    
    print(f"📝 Parsing command: '{text}'")
    
    try:
        # Use hybrid spaCy + Ollama (set use_ollama=False to disable Ollama fallback)
        intent, entities = get_intent_and_entities(text, use_ollama=True)
        result = route_command(intent, entities)
        
        print(f"✅ Result: {result}")
        return jsonify(result)
    except Exception as e:
        print(f"❌ Parse error: {e}")
        return jsonify({
            'status': 'error',
            'message': f'Error parsing command: {str(e)}'
        }), 500


@app.route('/api/diagnose', methods=['POST'])
def diagnose_audio():
    """Diagnostics endpoint: validates audio payload and returns metadata + quick transcript."""
    print("🧪 Diagnose: received request")
    if 'audio' not in request.files:
        return jsonify({'error': 'No audio file provided'}), 400

    audio_file = request.files['audio']
    raw = audio_file.read()
    byte_len = len(raw)
    print(f"🧾 Raw bytes: {byte_len}")

    # Save to temp for pydub inspection
    with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as temp_input:
        temp_input.write(raw)
        temp_input_path = temp_input.name

    meta = {
        'filename': audio_file.filename,
        'bytes': byte_len,
        'content_type': audio_file.mimetype,
    }

    try:
        try:
            seg = AudioSegment.from_file(temp_input_path)
        except Exception as e:
            raise RuntimeError(
                 "Decode failed. Install ffmpeg and ensure it's on PATH. "
                f"Original error: {e}"
            )

        meta.update({
            'duration_ms': len(seg),
            'frame_rate': seg.frame_rate,
            'channels': seg.channels,
            'sample_width_bytes': seg.sample_width,
            'rms': seg.rms,
            'max': seg.max,
        })

        # Export normalized WAV for Whisper shape check
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as temp_wav:
            wav_path = temp_wav.name
        seg.set_frame_rate(16000).set_channels(1).export(wav_path, format="wav")
        meta['wav_bytes'] = os.path.getsize(wav_path)

        # Quick transcript attempt
        transcript = transcribe_audio(io.BytesIO(raw))

        # Heuristic flags
        meta['likely_silent'] = seg.rms < 200  # very quiet
        meta['likely_clipped'] = seg.max > 32000  # near 16-bit ceiling

        return jsonify({
            'ok': True,
            'meta': meta,
            'transcript': transcript,
        })
    except Exception as e:
        print(f"❌ Diagnose error: {e}")
        return jsonify({'ok': False, 'error': str(e), 'meta': meta}), 500
    finally:
        try:
            if os.path.exists(temp_input_path):
                os.unlink(temp_input_path)
        except Exception:
            pass

@app.route('/api/save-debug-audio', methods=['POST'])
def save_debug_audio():
    """Save received audio to disk for manual inspection"""
    if 'audio' not in request.files:
        return jsonify({'error': 'No audio file'}), 400
    
    audio_file = request.files['audio']
    debug_dir = os.path.join(os.path.dirname(__file__), 'debug_audio')
    os.makedirs(debug_dir, exist_ok=True)
    
    timestamp = int(time.time() * 1000)
    webm_path = os.path.join(debug_dir, f"debug_{timestamp}.webm")
    wav_path = os.path.join(debug_dir, f"debug_{timestamp}.wav")
    
    # Save original webm
    audio_file.save(webm_path)
    print(f"💾 Saved debug audio: {webm_path}")
    
    # Convert to WAV for easy playback
    try:
        seg = AudioSegment.from_file(webm_path)
        seg.set_frame_rate(16000).set_channels(1).export(wav_path, format="wav")
        print(f"💾 Saved debug WAV: {wav_path}")
        
        # Get transcript
        with open(webm_path, 'rb') as f:
            transcript = transcribe_audio(io.BytesIO(f.read()))
        
        return jsonify({
            'ok': True,
            'webm_path': webm_path,
            'wav_path': wav_path,
            'transcript': transcript,
            'meta': {
                'duration_ms': len(seg),
                'frame_rate': seg.frame_rate,
                'channels': seg.channels,
                'rms': seg.rms,
            }
        })
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500

# ============================================
# WEBSOCKET HANDLERS FOR REAL-TIME AUDIO
# ============================================

# Store audio buffers per session
audio_buffers = {}
buffer_timestamps = {}  # Track buffer creation times for cleanup

def cleanup_stale_buffers():
    """Background thread to clean up stale buffers"""
    while True:
        try:
            time.sleep(BUFFER_CLEANUP_INTERVAL_SEC)
            current_time = datetime.now()
            stale_sids = []
            
            for sid, timestamp in buffer_timestamps.items():
                age_sec = (current_time - timestamp).total_seconds()
                if age_sec > BUFFER_STALE_TIMEOUT_SEC:
                    stale_sids.append(sid)
            
            for sid in stale_sids:
                if sid in audio_buffers:
                    del audio_buffers[sid]
                if sid in buffer_timestamps:
                    del buffer_timestamps[sid]
                print(f"🧹 Cleaned up stale buffer for session: {sid}")
        except Exception as e:
            print(f"❌ Error in cleanup thread: {e}")

# Start cleanup thread as daemon
cleanup_thread = threading.Thread(target=cleanup_stale_buffers, daemon=True)
cleanup_thread.start()
print("🧹 Buffer cleanup thread started")

@socketio.on('connect')
def handle_connect():
    print(f"🔌 Client connected: {request.sid}")
    audio_buffers[request.sid] = bytearray()
    buffer_timestamps[request.sid] = datetime.now()
    emit('connected', {'status': 'ready', 'sid': request.sid})

@socketio.on('disconnect')
def handle_disconnect():
    print(f"🔌 Client disconnected: {request.sid}")
    if request.sid in audio_buffers:
        del audio_buffers[request.sid]
    if request.sid in buffer_timestamps:
        del buffer_timestamps[request.sid]

@socketio.on('audio_chunk')
def handle_audio_chunk(data):
    """Receive audio chunk and buffer it"""
    try:
        sid = request.sid
        if sid not in audio_buffers:
            audio_buffers[sid] = bytearray()
            buffer_timestamps[sid] = datetime.now()
        
        # Validate audio data size
        audio_data = data.get('audio', [])
        if not isinstance(audio_data, (list, bytes, bytearray)):
            emit('error', {'message': 'Invalid audio data format'})
            return
        
        chunk_size = len(audio_data)
        if chunk_size > AUDIO_BUFFER_MAX_SIZE:
            emit('error', {'message': f'Audio chunk too large: {chunk_size} bytes (max {AUDIO_BUFFER_MAX_SIZE})'})
            return
        
        # Check if audio is already WAV format (skip conversion)
        is_wav_format = data.get('format') == 'wav'
        
        # Append chunk to buffer
        audio_buffers[sid].extend(audio_data)
        buffer_timestamps[sid] = datetime.now()  # Update timestamp on activity
        print(f"📦 Received chunk: {chunk_size} bytes, total: {len(audio_buffers[sid])} bytes, format: {'WAV' if is_wav_format else 'WebM'}")
        
        # If final chunk or buffer is large enough, process it
        is_final = data.get('final', False)
        # language optionally provided by client (e.g., 'en-US')
        language = data.get('language', 'en-US')
        if is_final or len(audio_buffers[sid]) >= AUDIO_BUFFER_THRESHOLD_BYTES:  # ~5 seconds at 16kHz
            print("🎤 Processing buffered audio...")
            audio_data = bytes(audio_buffers[sid])
            audio_buffers[sid] = bytearray()  # Clear buffer
            
            # Process audio
            audio_io = io.BytesIO(audio_data)
            try:
                transcript = transcribe_audio(audio_io, is_wav_format=is_wav_format, language=language)
                
                if transcript and transcript.strip():
                    print(f"✅ WebSocket transcript: '{transcript}'")
                    emit('transcript', {'text': transcript, 'final': is_final})
                else:
                    print("⏭️ Empty transcript (silence/noise)")
                    emit('transcript', {'text': '', 'final': is_final})
            except Exception as e:
                print(f"❌ Transcription error: {e}")
                emit('error', {'error': str(e)})
    
    except Exception as e:
        print(f"❌ WebSocket error: {e}")
        emit('error', {'error': str(e)})

@socketio.on('start_recording')
def handle_start_recording():
    """Signal that recording has started"""
    sid = request.sid
    audio_buffers[sid] = bytearray()
    print(f"🎙️ Recording started for {sid}")
    emit('recording_started', {'status': 'recording'})

@socketio.on('stop_recording')
def handle_stop_recording():
    """Process final buffered audio"""
    sid = request.sid
    if sid in audio_buffers and len(audio_buffers[sid]) > 0:
        print("🎤 Processing final audio buffer...")
        audio_data = bytes(audio_buffers[sid])
        audio_buffers[sid] = bytearray()
        
        audio_io = io.BytesIO(audio_data)
        try:
            # Default to en-US if client didn't supply language in chunks
            transcript = transcribe_audio(audio_io, language='en-US')
            if transcript and transcript.strip():
                emit('transcript', {'text': transcript, 'final': True})
            else:
                emit('transcript', {'text': '', 'final': True})
        except Exception as e:
            emit('error', {'error': str(e)})
    
    emit('recording_stopped', {'status': 'stopped'})

if __name__ == "__main__":
    enable_https = os.getenv("ENABLE_HTTPS", "false").lower() in ("1", "true", "yes")
    if enable_https:
        # Development self-signed cert; browsers may warn unless localhost
        print("🔐 Starting HTTPS server with WebSocket support (adhoc certificate)")
        socketio.run(app, host="0.0.0.0", port=5000, debug=True, ssl_context="adhoc")
    else:
        print("🚀 Starting HTTP server with WebSocket support")
        socketio.run(app, host="0.0.0.0", port=5000, debug=True)
