const Student = require("../models/Student");
const Business = require("../models/Business");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

function sanitizeUser(user, role) {
  if (!user) return null;

  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role,
    phone: user.phone || "",
    college: user.college || "",
    location: user.location || "",
    bio: user.bio || "",
    skills: user.skills || [],
    businessType: user.businessType || ""
  };
}

async function getUserFromTokenPayload(payload) {
  if (!payload?.id || !payload?.role) return null;
  if (payload.role === "business") return Business.findById(payload.id);
  return Student.findById(payload.id);
}

exports.registerStudent = async (req, res) => {
  try {
    const { name, email, password, skills, phone, college, location, bio } = req.body;
    const existingStudent = await Student.findOne({ email });

    if (existingStudent) {
      return res.status(400).json({ message: "Student already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newStudent = new Student({
      name,
      email,
      password: hashedPassword,
      skills,
      phone,
      college,
      location,
      bio
    });

    await newStudent.save();

    res.status(201).json({
      message: "Student registered successfully",
      user: sanitizeUser(newStudent, "student")
    });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

exports.registerBusiness = async (req, res) => {
  try {
    const { name, email, password, phone, businessType, location, bio } = req.body;
    const existingBusiness = await Business.findOne({ email });

    if (existingBusiness) {
      return res.status(400).json({ message: "Business already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newBusiness = new Business({
      name,
      email,
      password: hashedPassword,
      phone,
      businessType,
      location,
      bio
    });

    await newBusiness.save();

    res.status(201).json({
      message: "Business registered successfully",
      user: sanitizeUser(newBusiness, "business")
    });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    let user = await Student.findOne({ email });
    let role = "student";

    if (!user) {
      user = await Business.findOne({ email });
      role = "business";
    }

    if (!user) {
      return res.status(400).json({ message: "User not found" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid password" });
    }

    const token = jwt.sign(
      { id: user._id, role },
      process.env.JWT_SECRET || (() => { throw new Error("JWT_SECRET is not set in .env"); })(),
      { expiresIn: "7d" }
    );

    res.status(200).json({
      message: "Login successful",
      token,
      role,
      user: sanitizeUser(user, role)
    });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

exports.getMe = async (req, res) => {
  try {
    const user = await getUserFromTokenPayload(req.user);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json(sanitizeUser(user, req.user.role));
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

exports.updateMe = async (req, res) => {
  try {
    const user = await getUserFromTokenPayload(req.user);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const baseFields = {
      name: req.body.name,
      phone: req.body.phone,
      location: req.body.location,
      bio: req.body.bio
    };

    Object.entries(baseFields).forEach(([key, value]) => {
      if (typeof value === "string") user[key] = value.trim();
    });

    if (req.user.role === "student") {
      if (typeof req.body.college === "string") user.college = req.body.college.trim();
      if (Array.isArray(req.body.skills)) user.skills = req.body.skills;
    }

    if (req.user.role === "business") {
      if (typeof req.body.businessType === "string") user.businessType = req.body.businessType.trim();
    }

    await user.save();

    res.status(200).json({
      message: "Profile updated",
      user: sanitizeUser(user, req.user.role)
    });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

