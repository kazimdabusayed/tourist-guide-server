const express = require("express");
const { MongoClient, ServerApiVersion } = require("mongodb");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const app = express();
const cors = require("cors");
require("dotenv").config();
const port = process.env.PORT || 3000;

//middleware
app.use(
	cors({
		origin: [
			"http://localhost:5173",
			"https://tourist-guide-13de3.web.app",
		],
		credentials: true,
		optionSuccessStatus: 200,
	})
);
app.use(cors());
app.use(express.json());

//mongodb
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.vvczxa8.mongodb.net/?retryWrites=true&w=majority`;


// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
	serverApi: {
		version: ServerApiVersion.v1,
		strict: true,
		deprecationErrors: true,
	},
});

const logger = async (req, res, next) => {
	console.log("log: info", req.method, req.url);
	next();
};

const verifyToken = async (req, res, next) => {
	const token = req?.cookies?.token;
	console.log("value of token in middeware", token);
	if (!token) {
		return res.status(401).send({ massage: "not authorized" });
	}
	jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
		//error
		if (err) {
			console.log(err);
			return res.status(401).send({ massage: "unauthorized" });
		}
		// if token is valid then it would be decoded
		console.log("Value in the token", decoded);
		req.user = decoded;
		next();
	});
};

async function run() {
	try {
		// Connect the client to the server	(optional starting in v4.7)
		await client.connect();

		const userCollection = client.db("touristDB").collection("users");
		const packageCollection = client.db("touristDB").collection("packages");
		const wishlistCollection = client
			.db("touristDB")
			.collection("wishlists");
		const storyCollection = client.db("bistroDb").collection("stories");

		//! auth
		app.post("/api/v1/jwt", logger, async (req, res) => {
			const user = req.body;
			console.log(user);
			const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
				expiresIn: "1h",
			});
			res.cookie("token", token, {
				httpOnly: true,
				secure: process.env.NODE_ENV === "production" ? true : false,
				sameSite:
					process.env.NODE_ENV === "production" ? "none" : "strict",
			}).send({ succes: true });
		});

		app.post("/api/v1/logout", async (req, res) => {
			const user = req.body;
			console.log(user);
			res.clearCookie("token", {
				maxAge: 0,
				secure: process.env.NODE_ENV === "production" ? true : false,
				sameSite:
					process.env.NODE_ENV === "production" ? "none" : "strict",
			}).send({ succes: true });
		});

		//users
		app.post("/api/users", async (req, res) => {
			const user = req.body;
			//
			const query = { email: user.email };
			const existingUser = await userCollection.find(query);
			if (existingUser) {
				return res.send({
					message: "User already exists",
					insertedId: null,
				});
			}
			const result = await userCollection.insertOne(user);
			res.send(result);
		});
		app.get("/api/users", async (req, res) => {
			const cursor = userCollection.find();
			const result = await cursor.toArray();
			res.send(result);
		});

		//packages
		app.post("/api/packages", async (req, res) => {
			const package = req.body;
			const result = await packageCollection.insertOne(package);
			res.send(result);
		});
		app.get("/api/packages", async (req, res) => {
			const result = await packageCollection.find().toArray();
			res.send(result);
		});

		//wishlists
		app.post("/api/wishlists", async (req, res) => {
			const wishlist = req.body;
			const result = await wishlistCollection.insertOne(wishlist);
			res.send(result);
		});
		app.get("/api/wishlists", async (req, res) => {
			const email = req.body.email;
			const query = { email: email };
			const result = await wishlistCollection.find(query).toArray();
			res.send(result);
		});

		//stories
		app.post("/api/stories", async (req, res) => {
			const story = req.body;
			const result = await storyCollection.insertOne(story);
			res.send(result);
		});
		app.get("/api/stories", async (req, res) => {
			const result = await storyCollection.find().toArray();
			res.send(result);
		});

		// Send a ping to confirm a successful connection
		await client.db("admin").command({ ping: 1 });
		console.log(
			"Pinged your deployment. You successfully connected to MongoDB!"
		);
	} finally {
		// Ensures that the client will close when you finish/error
		// await client.close();
	}
}
run().catch(console.dir);

app.get("/", (req, res) => {
	res.send("Tourist Guide!");
});

app.listen(port, () => {
	console.log(`Guide listening on port ${port}`);
});
