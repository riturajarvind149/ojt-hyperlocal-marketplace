function getUserRole() {
  try {
    const token = localStorage.getItem("token");
    if (!token) return null;

    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.role;

  } catch {
    return null;
  }
}

const role = getUserRole();

if (role !== "business") {
  alert("Access denied: Business only");
  window.location.href = "login.html";
}

const token = localStorage.getItem("token");

// ==============================
// LOAD APPLICATIONS
// ==============================
async function loadApplications() {
  try {

    const res = await fetch("http://localhost:5000/api/jobs/applications", {
      headers: {
        "Authorization": "Bearer " + token
      }
    });

    const data = await res.json();

    const appDiv = document.getElementById("applications");
    appDiv.innerHTML = "";

    data.forEach(app => {
      const div = document.createElement("div");
      div.className = "card";

      div.innerHTML = `
        <p><b>Job:</b> ${app.jobId.title}</p>
        <p><b>Student:</b> ${app.studentId.email}</p>

        <p>
          <b>Status:</b> 
          <span class="badge-${app.status}">
            ${
              app.status === "accepted" ? "✔ ACCEPTED" :
              app.status === "rejected" ? "❌ REJECTED" :
              "⏳ PENDING"
            }
          </span>
        </p>

        ${
          app.status === "pending"
            ? `
              <button onclick="updateStatus('${app._id}', 'accepted')">
                Accept
              </button>

              <button onclick="updateStatus('${app._id}', 'rejected')">
                Reject
              </button>
            `
            : ``
        }

        <hr/>
      `;

      appDiv.appendChild(div);
    });

  } catch (error) {
    console.log(error);
  }
}


// ==============================
// UPDATE STATUS
// ==============================
async function updateStatus(appId, status) {
  try {

    console.log("Clicked:", appId, status); //

    const res = await fetch("http://localhost:5000/api/jobs/application-status", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + token
      },
      body: JSON.stringify({ applicationId: appId, status })
    });

    const data = await res.json();

    console.log("Server Response:", data);

    alert(data.message);

    await loadApplications();
  } catch (error) {
    console.log(error);
  }
}


// ==============================
//NAVIGATION
// ==============================
function goToCreateJob() {
  window.location.href = "create-job.html";
}


loadApplications();