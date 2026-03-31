const token = localStorage.getItem("token");

async function createJob() {
  try {

    const title = document.getElementById("title").value;
    const description = document.getElementById("description").value;
    const budget = document.getElementById("budget").value;

    const res = await fetch("http://localhost:5000/api/jobs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + token
      },
      body: JSON.stringify({ title, description, budget })
    });

    const data = await res.json();

    alert(data.message);

    window.location.href = "business.html";

  } catch (error) {
    console.log(error);
  }
}