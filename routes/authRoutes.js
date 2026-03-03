const express = require("express");
const router = express.Router();
const { registerStudent } = require("../controllers/authController");

router.post("/register-student", registerStudent);

module.exports = router;