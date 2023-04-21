require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const ejs = require("ejs");
const mongoose = require("mongoose");
const session = require("express-session");
const passport = require("passport");
const LocalStratgy = require("passport-local").Strategy;
const passportLocalMongoose = require("passport-local-mongoose");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const findOrCreate = require("mongoose-findorcreate");

const app = express();

const PORT = 3000 || process.env.PORT;

//setting up
app.use(express.static("public"));
app.set("view engine", "ejs");
app.use(bodyParser.urlencoded({ extended: true }));
app.use(
	session({
		secret: process.env.SECRET,
		resave: false,
		saveUninitialized: false,
		// cookie: { secure: true },
	})
);
app.use(passport.initialize());
app.use(passport.session());

//MongoDB connection
const mongoDB =
	"mongodb+srv://harsh:t7QJMrepRvoAXekz@authproject.swtw8s8.mongodb.net/AuthProject?retryWrites=true&w=majority";
(async () => {
	console.log("env:", app.get("env"));
	try {
		await mongoose.connect(mongoDB, {
			useNewUrlParser: true,
			useUnifiedTopology: true,
		});
		console.log("Connected to SecretsDB");
	} catch (error) {
		console.log("Could not connect to SecretsDB");
		throw error;
	}
})().catch((err) => console.log(`Seems like we ran into a error: ${err}`));

const userSchema = new mongoose.Schema({
	email: String,
	password: String,
	googleId: String,
	secret: String,
});
userSchema.plugin(passportLocalMongoose);
userSchema.plugin(findOrCreate);
const User = new mongoose.model("User", userSchema);

//Authentication setup
passport.use(User.createStrategy());
passport.serializeUser((user, cb) => {
	process.nextTick(function () {
		return cb(null, user.id);
	});
});
passport.deserializeUser(async (id, cb) => {
	try {
		const user = await User.findById(id).exec();
		return cb(null, user);
	} catch (err) {
		console.log(err);
		return cb(err, null);
	}
});

passport.use(
	new GoogleStrategy(
		{
			clientID: process.env.CLIENT_ID,
			clientSecret: process.env.CLIENT_SECRET,
			callbackURL: "http://localhost:3000/auth/google/secrets",
			// userProfileURL: "https://www.googleapis.com/oauth2/v3/userinfo",
		},
		function (accessToken, refreshToken, profile, cb) {
			console.log(profile);
			User.findOrCreate({ googleId: profile.id }, function (err, user) {
				return cb(err, user);
			});
		}
	)
);

//routes

app.get("/", (req, res) => {
	res.render("home");
});

app.get(
	"/auth/google",
	passport.authenticate("google", { scope: ["profile"] })
);

app.get(
	"/auth/google/secrets",
	passport.authenticate("google", { failureRedirect: "/login" }),
	function (req, res) {
		// Successful authentication, redirect secrets.
		res.redirect("/secrets");
	}
);

app.get("/login", (req, res) => {
	res.render("login");
});

app.post("/login", async (req, res) => {
	const user = new User({
		username: req.body.username,
		password: req.body.passport,
	});
	req.login(user, function (err) {
		if (err) {
			console.log("couldnt login and returned error:", err);
			res.redirect("/login");
		} else {
			passport.authenticate("local")(req, res, () => {
				res.redirect("/secrets");
			});
		}
	});
});

app.get("/register", (req, res) => {
	res.render("register");
});

app.get("/secrets", async (req, res) => {
	const foundSecrets = await User.find({ secret: { $ne: null } }).exec();
	if (!foundSecrets) {
		console.log("Couldnt find secrets");
	} else {
		res.render("secrets", { usersWithSecrets: foundSecrets });
	}
});

app.get("/submit", (req, res) => {
	if (req.isAuthenticated()) {
		res.render("submit");
	} else {
		res.redirect("/login");
	}
});

app.post("/submit", async (req, res) => {
	const submittedSecret = req.body.secret;
	const id = req.user._id;
	const foundUser = await User.findById(id).exec();

	if (!foundUser) {
		console.log("couldnt find user by id");
	} else {
		foundUser.secret = submittedSecret;
		await foundUser.save();
		console.log("secret saved");
		res.redirect("/secrets");
	}
});

app.get("/logout", (req, res) => {
	req.logout((err) => {
		if (err) {
			console.log("couldnt log out", err);
			return next(err);
		}
		console.log("logged out");
		res.redirect("/");
	});
});

app.post("/register", async (req, res) => {
	try {
		const registerUser = await User.register(
			{ username: req.body.username },
			req.body.password
		);
		if (registerUser) {
			passport.authenticate("local")(req, res, function () {
				console.log("registered");
				res.redirect("/secrets");
			});
		} else {
			console.log("couldnt register");
			res.redirect("/register");
		}
	} catch (err) {
		console.log("couldnt register and error:", err);
	}
});

app.listen(PORT, () => {
	console.log(`Server started on port ${PORT}`);
});
