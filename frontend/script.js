// ===============================
// LOGIN FUNCTION (COMMON)
// ===============================
async function login() {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  try {
    const res = await fetch("http://localhost:5000/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();

    if (res.ok) {
      localStorage.setItem("token", data.token);

      // Decode token
      const payload = JSON.parse(atob(data.token.split(".")[1]));

      // Redirect based on role
      if (payload.role === "business") {
        window.location.href = "business.html";
      } else {
        window.location.href = "dashboard.html";
      }

    } else {
      alert(data.message);
    }

  } catch (error) {
    console.log(error);
    alert("Server error");
  }
}