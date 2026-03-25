const Job = require("../models/Job");

exports.createJob = async (req, res) => {

  try {

    const { title, description, budget } = req.body;

    const job = new Job({
      title,
      description,
      budget,
      businessId: req.user.id
    });

    await job.save();

    res.status(201).json({
      message: "Job created successfully",
      job
    });

  } catch (error) {
    console.log(error);
    res.status(500).json({
      message: "Server error"
    });
  }

};