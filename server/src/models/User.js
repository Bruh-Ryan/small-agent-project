import mongoose from "mongoose";

const { Schema, model } = mongoose;

// One document per registered account, `users` collection.
// Passwords are stored ONLY as bcrypt hashes (cost 10) — never plaintext.
const userSchema = new Schema(
  {
    username: {
      type: String,
      required: [true, "username is required"],
      unique: true,
      trim: true,
      lowercase: true,
      minlength: 3,
      maxlength: 30,
      match: [/^[a-z0-9_]+$/i, "letters, digits and underscore only"],
    },
    passwordHash: { type: String, required: true },
  },
  { collection: "users", timestamps: true }
);

export const User = model("User", userSchema);
