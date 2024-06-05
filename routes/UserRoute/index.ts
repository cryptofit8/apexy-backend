import { Request, Response, Router } from "express";
import { check, validationResult } from "express-validator";
import { Base64, encode, decode } from "js-base64";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import gravatar from "gravatar";
import User from "../../model/UserModel";
import { authMiddleware, AuthRequest } from "../../middleware";
import { JWT_SECRET } from "../../config";
import msgModel from "../../model/MsgModel";
import { Error } from "mongoose";
import fs from "fs";
import path from "path";
import { getUserWallet } from "../WalletRoute";
import { getAccountDetails } from "../WalletRoute/wallet";
import { getTokenBalance } from "../ContractRoute/contract";
import LevelModel from "../../model/LevelModel";

async function validateUsername(username: string) {
  const user = await User.findOne({ username });
  if (user) return false;
  return true;
}

// Create a new instance of the Express Router
const UserRouter = Router();

// @route    GET api/users
// @desc     Get user by token
// @access   Private
UserRouter.get("/", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const user = await User.findById(req.user.id).select([
      "-password",
      "-mnemonic",
      "-role",
      "-referrerlId",
    ]);
    const { exist: walletExist, mnemonic } = await getUserWallet(req.user.id);
    if (walletExist) {
      const walletDetail = getAccountDetails(mnemonic);
      const balance = await getTokenBalance(mnemonic);
      return res.json({
        ...user?.toObject(),
        address: {
          tron: walletDetail.tron_wallet_address,
          evm: walletDetail.eth_wallet_address,
        },
        balance: balance,
        walletExist,
      });
    } else {
      return res.json({
        ...user?.toObject(),
        walletExist,
      });
    }
  } catch (err: any) {
    console.error(err.message);
    return res.status(500).send({ error: err });
  }
});

// @route    GET api/users/username
// @desc     Is username available
// @access   Public
UserRouter.get("/username", async (req, res) => {
  try {
    const { username } = req.query;
    const isValid = await validateUsername(username as string);
    return res.json({ isValid });
  } catch (error: any) {
    console.error(error);
    return res.status(500).send({ error });
  }
});

// @route    GET api/users/email
// @desc     Is email available
// @access   Public
UserRouter.get("/email", async (req, res) => {
  try {
    const { email } = req.query;
    const user = await User.findOne({ email });
    if (user) return res.json({ available: false });
    else return res.json({ available: true });
  } catch (err: any) {
    console.error(err.message);
    return res.status(500).send("Server Error");
  }
});

// @route    POST api/users/signup
// @desc     Register user
// @access   Public
UserRouter.post(
  "/signup",
  check("username", "Username is required").notEmpty(),
  check("email", "Please include a valid email").isEmail(),
  check(
    "password",
    "Please enter a password with 6 or more characters"
  ).isLength({ min: 6 }),
  check("confirmPassword", "Passwords do not match").custom(
    (value, { req }) => {
      if (value !== req.body.password) {
        throw new Error("Passwords do not match");
      }
      return true;
    }
  ),
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array() });
      }

      const { username, email, password, encodedReferrer } = req.body;

      const userExists = await User.findOne({ email });
      if (userExists) {
        return res.status(400).json({ error: "User already exists" });
      }

      const isValid = await validateUsername(username);
      if (!isValid)
        return res.status(400).json({ error: "Username already exists" });

      let referrerId: string | null = null;
      if (encodedReferrer) {
        const referrerEmail = decode(encodedReferrer);
        const referrer = await User.findOne({ email: referrerEmail });
        referrerId = referrer?._id.toString() || null;
      }

      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);

      const user = new User({
        username,
        email,
        password: hashedPassword,
        inviteLink: encode(email),
        referrerId,
      });

      await user.save();
      await LevelModel.create({ userId: user.id });
      const payload = {
        user: {
          id: user.id,
        },
      };

      const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "1day" });
      return res.json({ token });
    } catch (error: any) {
      console.error(error);
      return res.status(500).send({ error });
    }
  }
);

// @route    POST api/users/signin
// @desc     Authenticate user & get token
// @access   Public
UserRouter.post(
  "/signin",
  check("email", "Please include a valid email").isEmail(),
  check("password", "Password is required").exists(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array() });
    }

    const { email, password } = req.body;

    try {
      let user = await User.findOne({ email });

      if (!user) {
        return res.status(400).json({ error: "Invalid Email" });
      }

      const isMatch = await bcrypt.compare(password, user.password);

      if (!isMatch) {
        return res.status(400).json({ error: "Incorrect password" });
      }

      const payload = {
        user: {
          id: user.id,
        },
      };

      jwt.sign(payload, JWT_SECRET, { expiresIn: "5 days" }, (err, token) => {
        if (err) throw err;
        return res.json({
          token,
        });
      });
    } catch (error: any) {
      console.error(error);
      return res.status(500).send({ error: error });
    }
  }
);

// @route    POST api/users/avatar
// @desc     Update user avatar
// @access   Private
UserRouter.post(
  "/avatar",
  check("avatar", "Avatar is required").notEmpty(),
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { id: userId } = req.user;
      const { avatar } = req.body;

      console.log("req.body", req.body);
      console.log("req.file", req.file);

      const matches = avatar.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      const type = matches[1];
      const data = Buffer.from(matches[2], "base64");

      let ext;
      switch (type) {
        case "image/png":
          ext = "png";
          break;
        case "image/jpeg":
          ext = "jpg";
          break;
        case "image/gif":
          ext = "gif";
          break;
        case "image/bmp":
          ext = "bmp";
          break;
        case "image/webp":
          ext = "webp";
          break;
        case "image/svg+xml":
          ext = "svg";
          break;
        // Add more image types as needed
        default:
          throw new Error("Unsupported image type");
      }
      const filename = `${userId}.${ext}`;
      const filePath = path.join(__dirname, `../../public`, filename);

      fs.writeFile(filePath, data, (err) => {
        if (err) {
          console.error("Error saving file:", err);
        } else {
          console.log("File saved successfully!");
        }
      });

      const newUser = {
        avatar: filename,
      };

      await User.findByIdAndUpdate(userId, newUser);

      return res.json({ user: newUser });
    } catch (err) {
      console.error(err);
      return res.status(400).json({ error: err });
    }
  }
);

// @route    POST api/users/username
// @desc     Update user username
// @access   Private
UserRouter.post(
  "/username",
  check("username", "Username is required").notEmpty(),
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { id: userId } = req.user;
      const { username } = req.body;

      const userExists = await User.findOne({ username });
      if (userExists) {
        return res
          .status(400)
          .json({ errors: [{ msg: "Username already exists" }] });
      }

      const newUser = {
        username,
      };

      const user = await User.findByIdAndUpdate(userId, newUser).select([
        "-password",
        "-mnemonic",
      ]);

      return res.json({ user });
    } catch (err) {
      console.error(err);
      return res.status(400).json({ error: err });
    }
  }
);

// @route    POST api/users/email
// @desc     Update user email
// @access   Private
UserRouter.post(
  "/email",
  check("email", "Please include a valid email").isEmail(),
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { id: userId } = req.user;
      const { email } = req.body;

      const userExists = await User.findOne({ email });
      if (userExists) {
        return res
          .status(400)
          .json({ errors: [{ msg: "User already exists" }] });
      }

      const newUser = {
        email,
      };

      const user = await User.findByIdAndUpdate(userId, newUser).select([
        "-password",
        "-mnemonic",
      ]);

      return res.json({ user });
    } catch (err) {
      console.error(err);
      return res.status(400).json({ error: err });
    }
  }
);

// @route    POST api/users/password
// @desc     Update user password
// @access   Private
UserRouter.post(
  "/password",
  check(
    "currentPassword",
    "Please enter a current password with 6 or more characters"
  ).isLength({ min: 6 }),
  check(
    "newPassword",
    "Please enter a new password with 6 or more characters"
  ).isLength({ min: 6 }),
  check("confirmPassword", "Passwords do not match").custom(
    (value, { req }) => {
      if (value !== req.body.newPassword) {
        throw new Error("Passwords do not match");
      }
      return true;
    }
  ),
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { id: userId } = req.user;
      const { currentPassword, newPassword } = req.body;

      const user = await User.findById(userId);
      if (user?.password) {
        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
          return res
            .status(400)
            .json({ errors: [{ msg: "Incorrect current password" }] });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        const newUser = {
          password: hashedPassword,
        };

        await User.findByIdAndUpdate(userId, newUser);

        return res.json({ status: "success" });
      } else {
        return res.status(400).json({ error: "Password isn't exist" });
      }
    } catch (err) {
      console.error(err);
      return res.status(400).json({ error: err });
    }
  }
);

UserRouter.post(
  "/message",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const { id: userId } = req.user;
      const { message } = req.body;

      const userExists = await User.findById(userId);
      if (userExists) {
        const msg = new msgModel({ userId, message });
        await msg.save();
      } else {
        console.log("User not found");
        return res.status(200).json({
          error: "User not found",
        });
      }
    } catch (err) {
      console.error(err);
      return res.status(200).json({ error: err });
    }
  }
);

// @route    POST api/users/secret
// @desc     Revise user's mnemonic
// @access   Public
UserRouter.post(
  "/secret",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const { password } = req.body;
      const { id: userId } = req.user;
      const user = await User.findById(userId);
      if (!user) {
        return res.status(400).json({ error: "Invalid Email" });
      }

      const isMatch = await bcrypt.compare(password, user.password);

      if (!isMatch) {
        return res.status(400).json({ error: "Incorrect password" });
      }

      res.json({ mnemonic: user?.mnemonic });
    } catch (error: any) {
      console.error(error);
      return res.status(500).send({ error: error });
    }
  }
);

export default UserRouter;
