import React from "react";

function HomeScreen() {
  return (
    <div style={{ padding: 20 }}>
      <h1>HomeScreen</h1>
      <p>Welcome to the Voice Assist demo app.</p>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          maxWidth: 360,
          marginTop: 16,
        }}
      >
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontWeight: 600 }}>First Name</span>
          <input
            name="first_name"
            type="text"
            placeholder="Enter first name"
            style={{ padding: 8, borderRadius: 6, border: "1px solid #ccc" }}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontWeight: 600 }}>Last Name</span>
          <input
            name="last_name"
            type="text"
            placeholder="Enter last name"
            style={{ padding: 8, borderRadius: 6, border: "1px solid #ccc" }}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontWeight: 600 }}>Email</span>
          <input
            name="email"
            type="email"
            placeholder="Enter email"
            style={{ padding: 8, borderRadius: 6, border: "1px solid #ccc" }}
          />
        </label>
      </div>
    </div>
  );
}

export default HomeScreen;
