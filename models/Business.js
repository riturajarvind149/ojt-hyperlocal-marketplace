const mongoose = require("mongoose");

const businessSchema = new mongoose.Schema({

  name:{
    type:String,
    required:true
  },

  email:{
    type:String,
    required:true,
    unique:true
  },

  password:{
    type:String,
    required:true
  },

  phone:{
    type:String
  },

  businessType:{
    type:String
  },

  location:{
    type:String
  },

  bio:{
    type:String
  }

},{timestamps:true});

module.exports = mongoose.model("Business",businessSchema);
