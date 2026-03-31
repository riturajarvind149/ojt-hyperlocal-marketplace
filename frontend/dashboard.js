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

if (role !== "student") {
  alert("Access denied: Students only");
  window.location.href = "login.html";
}

const token = localStorage.getItem("token");

//  Logout
function logout() {
  localStorage.removeItem("token");
  window.location.href = "login.html";
}

//Load Jobs
async function loadJobs() {
  try {
    const res = await fetch("http://localhost:5000/api/jobs");
    const jobs = await res.json();

    const jobsDiv = document.getElementById("jobs");
    jobsDiv.innerHTML = "";

    jobs.forEach(job => {
      const div = document.createElement("div");
      div.className = "job-card";

      div.innerHTML = `
        <h3>${job.title}</h3>
        <p>${job.description}</p>
        <p><b>Budget:</b> ₹${job.budget}</p>
        <button onclick="applyJob('${job._id}', this)">Apply</button>
      `;

      jobsDiv.appendChild(div);
    });

  } catch (error) {
    console.log(error);
  }
}

// Apply Job
async function applyJob(jobId, btn) {
  try {
    const res = await fetch("http://localhost:5000/api/jobs/apply", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + token
      },
      body: JSON.stringify({ jobId })
    });

    const data = await res.json();

    if (res.status === 200) {
      btn.innerText = "Applied";
      btn.disabled = true;
    }

    alert(data.message);

  } catch (error) {
    console.log(error);
  }
}

//INIT
loadJobs();