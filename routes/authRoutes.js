const express = require("express");
const router = express.Router();

const { registerStudent, registerBusiness } = require("../controllers/authController");

router.post("/register-student", registerStudent);
router.post("/register-business", registerBusiness);

module.exports = router;