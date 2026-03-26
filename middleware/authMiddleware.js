// 📌 TOPIC: Auth Middleware
// 📌 PURPOSE: Ye JWT token verify karta hai aur user ko identify karta hai

const jwt = require("jsonwebtoken");

exports.verifyToken = (req, res, next) => {

  try {

    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        message: "No token provided"
      });
    }

    const token = authHeader.split(" ")[1];

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = decoded;

    // 🔥 DEBUG LINE (IMPORTANT)
    console.log("USER FROM TOKEN:", req.user);

    next();

  } catch (error) {
    console.log("JWT ERROR:", error); // 👈 ye bhi add kar
    return res.status(401).json({
      message: "Invalid token"
    });
  }

};