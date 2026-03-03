const Student = require("../models/Student");
const bcrypt = require("bcrypt");

// Student Registration
exports.registerStudent = async (req, res) => {
  try {
    const { name, email, password, skills } = req.body;

    // Check if student already exists
    const existingStudent = await Student.findOne({ email });
    if (existingStudent) {
      return res.status(400).json({ message: "Student already exists" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new student
    const newStudent = new Student({
      name,
      email,
      password: hashedPassword,
      skills
    });

    await newStudent.save();

    res.status(201).json({ message: "Student registered successfully" });

  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
};