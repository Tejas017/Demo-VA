import React, { useState } from "react";
import App from "../App";

const initialFormState = {
  name: "",
  doctor: "",
  type: "",
  date: "",
  time: "",
};

const previousAppointments = [
  {
    name: "John Doe",
    doctor: "Dr. Smith",
    type: "Consultation",
    date: "2024-06-01",
    time: "10:00",
  },
  {
    name: "Jane Roe",
    doctor: "Dr. Adams",
    type: "Follow-up",
    date: "2024-05-28",
    time: "14:30",
  },
];

const appointmentTypes = [
  "Consultation",
  "Follow-up",
  "Routine Check",
  "Emergency",
  "Other",
];

const Appointments = () => {
  const [form, setForm] = useState(initialFormState);
  const [history, setHistory] = useState(previousAppointments);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setHistory([form, ...history]);
    setForm(initialFormState);
  };

  const handleReset = () => {
    setForm(initialFormState);
  };

  return (
    <div className="appointments-root">
      {/* History (Left Side) */}
      <div className="appointments-history">
        <h2 className="appointments-history-title">Appointment History</h2>
        {history.length === 0 ? (
          <p className="appointments-no-history">No previous appointments.</p>
        ) : (
          <div className="appointments-history-table-wrapper">
            <table className="appointments-history-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Doctor</th>
                  <th>Type</th>
                  <th>Date</th>
                  <th>Time</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {history.map((appt, idx) => (
                  <tr key={idx} className={idx % 2 === 0 ? "even" : "odd"}>
                    <td>{appt.name}</td>
                    <td>{appt.doctor}</td>
                    <td>
                      <span className="appointments-type-badge">
                        {appt.type}
                      </span>
                    </td>
                    <td>{appt.date}</td>
                    <td>{appt.time}</td>
                    <td>
                      <button
                        className="appointments-delete-btn"
                        onClick={() => {
                          setHistory(history.filter((_, i) => i !== idx));
                        }}
                        aria-label="Delete appointment"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="appointments-form-container">
        <h1 className="appointments-form-title">Book Appointment</h1>
        <form
          onSubmit={handleSubmit}
          onReset={handleReset}
          className="appointments-form"
        >
          <label className="appointments-label" htmlFor="appointments-name">
            Name:
            <input
              id="appointments-name"
              name="name"
              value={form.name}
              onChange={handleChange}
              required
              className="appointments-input"
            />
          </label>
          <label className="appointments-label" htmlFor="appointments-doctor">
            Doctor Name:
            <input
              id="appointments-doctor"
              name="doctor"
              value={form.doctor}
              onChange={handleChange}
              required
              className="appointments-input"
            />
          </label>
          <label className="appointments-label" htmlFor="appointments-type">
            Appointment Type:
            <select
              id="appointments-type"
              name="type"
              value={form.type}
              onChange={handleChange}
              required
              className="appointments-input"
            >
              <option value="" disabled>
                Select type
              </option>
              {appointmentTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>
          <label className="appointments-label" htmlFor="appointments-date">
            Appointment Date:
            <input
              type="date"
              id="appointments-date"
              name="date"
              value={form.date}
              onChange={handleChange}
              required
              className="appointments-input"
            />
          </label>
          <label className="appointments-label" htmlFor="appointments-time">
            Appointment Time:
            <input
              type="time"
              id="appointments-time"
              name="time"
              value={form.time}
              onChange={handleChange}
              required
              className="appointments-input"
            />
          </label>
          <div className="appointments-btn-group">
            <button type="submit" className="appointments-btn">
              Submit
            </button>
            <button type="reset" className="appointments-btn">
              Reset
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Appointments;

// const styles = {
//   AppointmentsContainer: {
//     padding: 32,
//     maxWidth: 540,
//     margin: "40px auto",
//     background: "linear-gradient(135deg, #f8fafc 0%, #e0e7ff 100%)",
//     borderRadius: 18,
//     boxShadow: "0 6px 32px rgba(60, 72, 100, 0.12)",
//     display: "flex",
//     flexDirection: "column",
//     gap: 28,
//   },

//   AppointmentsForm: {
//     display: "flex",
//     flexDirection: "column",
//     gap: 18,
//     background: "rgba(255,255,255,0.95)",
//     border: "1.5px solid #a5b4fc",
//     borderRadius: 12,
//     padding: 24,
//     boxShadow: "0 2px 12px rgba(99, 102, 241, 0.07)",
//   },

//   FormLabel: {
//     display: "flex",
//     flexDirection: "column",
//     fontWeight: 500,
//     color: "#3730a3",
//     fontSize: 16,
//     gap: 6,
//   },

//   FormInput: {
//     marginTop: 4,
//     padding: "10px 12px",
//     border: "1.5px solid #c7d2fe",
//     borderRadius: 8,
//     fontSize: 15,
//     background: "#f1f5f9",
//     color: "#312e81",
//     outline: "none",
//     transition: "border 0.2s",
//   },

//   ButtonGroup: {
//     display: "flex",
//     gap: 16,
//     justifyContent: "center",
//     marginTop: 10,
//   },

//   Button: {
//     padding: "10px 28px",
//     borderRadius: 8,
//     border: "none",
//     background: "linear-gradient(90deg, #6366f1 0%, #818cf8 100%)",
//     color: "#fff",
//     fontWeight: 600,
//     fontSize: 16,
//     cursor: "pointer",
//     boxShadow: "0 2px 8px rgba(99, 102, 241, 0.13)",
//     transition: "background 0.2s, transform 0.1s",
//   },
// };
