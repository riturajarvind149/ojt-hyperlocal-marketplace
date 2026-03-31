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

      div.innerHTML = `
        <p><b>Job:</b> ${app.jobId.title}</p>
        <p><b>Student:</b> ${app.studentId.email}</p>
        <p><b>Status:</b> ${app.status}</p>

        <button onclick="updateStatus('${app._id}', 'accepted')">Accept</button>
        <button onclick="updateStatus('${app._id}', 'rejected')">Reject</button>

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

    const res = await fetch("http://localhost:5000/api/jobs/application-status", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + token
      },
      body: JSON.stringify({ applicationId: appId, status })
    });

    const data = await res.json();

    alert(data.message);

    loadApplications(); // refresh

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