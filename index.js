const express = require("express");
const { MongoClient, ServerApiVersion } = require("mongodb");
const jwt = require("jsonwebtoken");
// const cookieParser = require("cookie-parser");
const app = express();
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const cloudinary = require("./utils/cloudinary");
const upload = require("./middleware/multer");
// const mime = require("mime-types");
const imageDownloader = require("image-downloader");
const { ObjectId } = require("mongodb");
// const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
// const fs = require("fs");
// const mime = require("mime-types");
require("dotenv").config();
const port = process.env.PORT || 3000;

//middleware
app.use(
	cors({
		origin: [
			"http://localhost:5173",
			"https://tourist-guide-13de3.web.app",
			"https://tourist-trail-bd.web.app",
		],
		credentials: true,
		optionSuccessStatus: 200,
	})
);
app.use("/uploads", express.static(__dirname + "/uploads"));
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
		app.post("/api/jwt", logger, async (req, res) => {
			const user = req.body;
			const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
				expiresIn: "1h",
			});
			res.send({ token });
			// 	{
			// 	httpOnly: true,
			// 	secure: process.env.NODE_ENV === "production" ? true : false,
			// 	sameSite:
			// 		process.env.NODE_ENV === "production" ? "none" : "strict",
			// }).send({ succes: true });
		});

		//verifyToken middleware
		const verifyToken = async (req, res, next) => {
			if (!req.headers.authorization) {
				return res.status(401).send({ message: "unauthorized access" });
			}
			const token = req.headers.authorization.split(" ")[1];
			// console.log(56, token);
			jwt.verify(
				token,
				process.env.ACCESS_TOKEN_SECRET,
				(err, decoded) => {
					if (err) {
						return res
							.status(401)
							.send({ massage: "unauthorized access" });
					}
					req.decoded = decoded;
					next();
				}
			);
		};

		//user verifyAdmin after verifyToken
		const verifyAdmin = async (req, res, next) => {
			const email = req.decoded.email;
			const query = { email: email };
			const user = await userCollection.findOne(query);
			const isAdmin = user?.role === "admin";
			if (!isAdmin) {
				return res.status(403).send({ message: "forbidden access" });
			}
			next();
		};

		const verifyGuide = async (req, res, next) => {
			const email = req.decoded.email;
			const query = { email: email };
			const user = await userCollection.findOne(query);
			const isGuide = user?.role === "guide";
			if (!isGuide) {
				return res.status(403).send({ message: "forbidden access" });
			}
			next();
		};

		//users
		app.post("/api/users", async (req, res) => {
			const user = req.body;
			//check if user exists
			const query = { email: user.email };
			const existingUser = await userCollection.findOne(query);
			if (existingUser) {
				return res.send({
					message: "User already exists",
					insertedId: null,
				});
			}
			const result = await userCollection.insertOne(user);
			res.send(result);
		});
		app.get("/api/users", verifyToken, verifyAdmin, async (req, res) => {
			// console.log(req.headers);
			const cursor = userCollection.find();
			const result = await cursor.toArray();
			res.send(result);
		});
		app.get(
			"/api/users/guide/:email",
			verifyToken,
			verifyGuide,
			async (req, res) => {
				const email = req.params.email;

				if (email !== req.decoded.email) {
					return res
						.status(403)
						.send({ message: "forbidden access" });
				}
				const query = { email: email };
				const user = await userCollection.findOne(query);
				let guide = false;
				if (user) {
					guide = user?.role === "guide";
				}
				res.send({ guide });
			}
		);
		app.get(
			"/api/users/admin/:email",
			logger,
			verifyToken,
			verifyAdmin,
			async (req, res) => {
				const email = req.params.email;

				if (email !== req.decoded.email) {
					return res
						.status(403)
						.send({ message: "forbidden access" });
				}
				const query = { email: email };
				const user = await userCollection.findOne(query);
				let admin = false;
				if (user) {
					admin = user?.role === "admin";
				}
				res.send({ admin });
			}
		);

		app.patch(
			"/api/users/admin/:id",
			logger,
			verifyToken,
			verifyAdmin,
			async (req, res) => {
				const id = req.params.id;
				const filter = { _id: new ObjectId(id) };
				const updatedDoc = {
					$set: {
						role: "admin",
					},
				};
				const result = await userCollection.updateOne(
					filter,
					updatedDoc
				);
				res.send(result);
			}
		);
		app.patch(
			"/api/users/guide/:id",
			logger,
			verifyToken,
			verifyAdmin,
			async (req, res) => {
				const id = req.params.id;
				const filter = { _id: new ObjectId(id) };
				const updatedDoc = {
					$set: {
						role: "guide",
					},
				};
				const result = await userCollection.updateOne(
					filter,
					updatedDoc
				);
				res.send(result);
			}
		);

		app.delete(
			"/api/users/:id",
			verifyToken,
			verifyAdmin,
			async (req, res) => {
				const id = req.params.id;
				const query = { _id: new ObjectId(id) };
				const result = await userCollection.deleteOne(query);
				res.send(result);
			}
		);

		//photoUpload
		app.post("/api/upload-by-link", async (req, res) => {
			const { link } = req.body;
			const newName = "photo" + Date.now() + ".jpg";
			await imageDownloader.image({
				url: link,
				dest: __dirname + "/uploads/" + newName,
			});
			// const url = await uploadToS3(
			// 	"/tmp/" + newName,
			// 	newName,
			// 	mime.lookup("/tmp/" + newName)
			// );
			res.json(newName);
		});

		// (async function run() {
		// 	for (const image of images) {
		// 		const result = await cloudinary.uploader.upload(image);
		// 		console.log(result.secure_url);
		// 	}
		// })();

		const photosMiddleware = multer({ dest: "uploads/" });
		app.post(
			"/api/upload",
			photosMiddleware.array("photos", 50),
			async (req, res) => {
				const uploadedFiles = [];
				console.log(req.files);
				for (let i = 0; i < req.files.length; i++) {
					const { path, originalname, mimetype } = req.files[i];
					const parts = originalname.split(".");

					const ext = parts[parts.length - 1];
					const newPath = path + "." + ext;
					fs.renameSync(path, newPath);
					// const url = await uploadToS3(path, originalname, mimetype);
					uploadedFiles.push(newPath.replace("uploads\\", ""));
					// console.log(uploadedFiles);
				}
				res.json(uploadedFiles);
			}
		);

		app.post("/api/upload", upload.single("image"), function (req, res) {
			cloudinary.uploader.upload(req.file.path, function (err, result) {
				if (err) {
					console.log(err);
					return res.status(500).json({
						success: false,
						message: "Error",
					});
				}

				res.status(200).json({
					success: true,
					message: "Uploaded!",
					data: result,
				});
			});
		});


		app.post("/",upload.single("save__to__cloudinary"),
			async (req, res) => {
				const localFilePath = req.file?.path || "";

				const { isSuccess, message, statusCode, imageURL } =
					await cloudinaryInstance.uploadImage(localFilePath);

				return res.status(statusCode).json({
					isSuccess,
					message,
					imageURL,
				});
			}
		);

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
		app.get("/api/packages/:id", async (req, res) => {
			const id = req.params.id;
			const query = { _id: new ObjectId(id) };
			const result = await packageCollection.findOne(query);
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
		app.delete("/api/wishlists/:id", async (req, res) => {
			const id = req.params.id;
			const query = { _id: new ObjectId(id) };
			const result = await wishlistCollection.deleteOne(query);
			res.send(result);
		});

		//stories
		app.post("/api/stories", async (req, res) => {
			const story = req.body;
			const result = await storyCollection.insertOne(story);
			res.send(result);
		});
		app.get("/api/stories", async (req, res) => {
			const email = req.body.email;
			const query = { email: email };
			const result = await storyCollection.find(query).toArray();
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
