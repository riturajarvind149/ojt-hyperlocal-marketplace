const Student = require("../models/Student");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

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

const Business = require("../models/Business");

exports.registerBusiness = async (req,res)=>{

  try{

    const {name,email,password,phone,businessType,location} = req.body;

    const existingBusiness = await Business.findOne({email});

    if(existingBusiness){
      return res.status(400).json({
        message:"Business already exists"
      });
    }

    const hashedPassword = await bcrypt.hash(password,10);

    const newBusiness = new Business({
      name,
      email,
      password:hashedPassword,
      phone,
      businessType,
      location
    });

    await newBusiness.save();

    res.status(201).json({
      message:"Business registered successfully"
    });

  }

  catch(error){
    res.status(500).json({
      message:"Server error"
    });
  }

}

exports.login = async (req, res) => {
  try {

    const { email, password } = req.body;

    // check student
    let user = await Student.findOne({ email });

    let role = "student";

    if (!user) {
      user = await Business.findOne({ email });
      role = "business";
    }

    if (!user) {
      return res.status(400).json({
        message: "User not found"
      });
    }

    // compare password
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(400).json({
        message: "Invalid password"
      });
    }

    // generate token
    const token = jwt.sign(
      { id: user._id, role: role },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.status(200).json({
      message: "Login successful",
      token,
      role
    });

  } catch (error) {
    res.status(500).json({
      message: "Server error"
    });
  }
};