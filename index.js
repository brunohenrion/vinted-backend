const express = require("express");
const fileUpload = require("express-fileupload");
const mongoose = require("mongoose");
const cloudinary = require("cloudinary").v2;
const cors = require("cors");
require("dotenv").config();

const app = express();

app.use(cors());

const uid2 = require("uid2"); // Package qui sert à créer des string aléatoires
const SHA256 = require("crypto-js/sha256"); // Sert à encripter une string
const encBase64 = require("crypto-js/enc-base64"); // Sert à transformer l'encryptage en string
const { json } = require("express");

app.use(express.json());
mongoose.set("strictQuery", true);
mongoose.connect(process.env.MONGODB_URI);

const User = mongoose.model("User", {
  email: String,
  account: {
    username: String,
    //avatar: Object,
  },
  newsletter: Boolean,
  token: String,
  hash: String,
  salt: String,
});

const Offer = mongoose.model("Offer", {
  product_name: { type: String, maxlength: 50 },
  product_description: { type: String, maxlength: 500 },
  product_price: { type: Number, max: 100000 },
  product_details: Array,
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  product_image: Object,
});

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

const convertToBase64 = (file) => {
  return `data:${file.mimetype};base64,${file.data.toString("base64")}`;
};

app.post("/user/signup", async (req, res) => {
  try {
    const username = req.body.username;
    const password = req.body.password;
    const token = uid2(64);
    const salt = uid2(16);
    const hash = SHA256(salt + password).toString(encBase64);
    const emailDataBase = await User.findOne({ email: req.body.email });

    console.log(token);
    const user = new User({
      email: req.body.email,
      account: {
        username: req.body.username,
        avatar: req.body.object,
      },
      newsletter: req.body.newsletter,
      token: token,
      hash: hash,
      salt: salt,
    });

    console.log(emailDataBase);
    if (emailDataBase) {
      return res
        .status(400)
        .json({ message: "this email has been already introduced" });
    }

    if (!req.body.username) {
      return res.status(400).json({ message: "Please fill the username" });
    }

    /*
    newOffer.product_image = await cloudinary.uploader.upload(
      convertToBase64(req.files.picture),
      {
        folder: `/vinted/offers/${newOffer._id}`,
      }
    );
    */

    await user.save();

    const ResponseServer = {
      _id: user._id,
      token: token,
      account: {
        username: username,
      },
    };

    res.json(ResponseServer);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.post("/user/login", async (req, res) => {
  try {
    const password = req.body.password;
    const emailSearchedDataBase = await User.findOne({ email: req.body.email });
    const hash2 = SHA256(emailSearchedDataBase.salt + password).toString(
      encBase64
    );
    const ResponseServer = {
      _id: emailSearchedDataBase._id,
      token: emailSearchedDataBase.token,
      account: {
        username: emailSearchedDataBase.account.username,
      },
    };
    if (hash2 !== emailSearchedDataBase.hash) {
      return res.status(400).json({
        error: {
          message: "Mot de passe incorrect ",
        },
      });
    } else {
      res.json(ResponseServer);
      console.log(ResponseServer);
    }
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

const isAuthenticated = async (req, res, next) => {
  try {
    // Le token reçu est dans req.headers.authorization
    // console.log(req.headers.authorization);
    // je vais chercher mon token et j'enlève "Bearer "
    const token = req.headers.authorization.replace("Bearer ", "");
    //console.log(token);

    // Je vais chercher dans ma BDD un user dont le token est celui que j'ai reçu
    // J'en trouve un :

    const user = await User.findOne({ token });
    console.log(user);

    // const user = {
    //   name: "bruno",
    //   email: "bruno@lereacteur.io",
    //   token: "IfzE2xSv2-JGCK6a",
    // };

    // Si je n'en trouve pas ====> erreur
    if (!user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    // Si J'en trouve un, je le stocke dans req.user pour le garder sous la main et pouvoir le réutiliser dans ma route
    req.user = user;
    // Je passe au middleware suivant
    next();
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

app.post("/offer/publish", fileUpload(), isAuthenticated, async (req, res) => {
  try {
    const { title, description, price, condition, city, brand, size, color } =
      req.body;

    console.log(req.body);

    const newOffer = new Offer({
      product_name: title,
      product_description: description,
      product_price: price,
      product_details: [
        { MARQUE: brand },
        { TAILLE: size },
        { ETAT: condition },
        { COULEUR: color },
        { EMPLACEMENT: city },
      ],
      owner: req.user,
    });
    newOffer.product_image = await cloudinary.uploader.upload(
      convertToBase64(req.files.picture),
      {
        folder: `/vinted/offers/${newOffer._id}`,
      }
    );
    await newOffer.save();

    res.json(newOffer);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.delete("/offer/delete/:_id", async (req, res) => {
  try {
    const task = await Offer.findById({ _id: req.params._id });
    await task.remove();

    // await cloudinary.v2.uploader.destroy("63c865c5ad33e867fcce5826");
    res.status(200).json({
      message: "Offer and picture linked to it has been deleted",
    });
  } catch (error) {
    res.json({ message: error.message });
  }
});

app.get("/offers", async (req, res) => {
  try {
    /*
    const { title, priceMin, priceMax, page } = req.query;
    const offersResults = await Offer.find();

    const results = await Offer.find({
      product_name: title,
    });

    res.json(results);

    */

    const filters = {};

    const titleRegex = new RegExp(req.query.title, "i");
    const priceMin = req.query.priceMin ? Number(req.query.priceMin) : 0;
    const priceMax = req.query.priceMax ? Number(req.query.priceMax) : 100000;
    const sortOffer = req.query.sort === "price-desc" ? -1 : 1;
    const page = req.query.page ? Number(req.query.page) : 10;
    console.log(page);
    let result = await Offer.find({
      product_name: titleRegex,
      product_price: { $gte: priceMin, $lte: priceMax },
    })
      .sort({ product_price: sortOffer })
      .select("product_name product_price -_id");
    res.status(200).json({ result });

    /*const express = require("express");
const router = express.Router();
const Offer = require("../models/Offer");

app.get("/offers", async (req, res) => {
  try {
    const { title, priceMin, priceMax, sort, page } = req.query;
    const regExp = new RegExp(title, "i");

    let numberToSkip = 1;
    numberToSkip = 5 * (page - 1); // 5 est le nb max d'offres affichées par page
    console.log(numberToSkip);

    if (!priceMin && !priceMax) {
      if (sort) {
        const newOffers = await Offer.find({
          product_name: regExp,
        })
          .skip(numberToSkip)
          .limit(5)
          .sort({ product_price: sort.replace("price-", "") })
          .select("product_name product_price -_id");
        return res.json(newOffers);
      }
      if (!sort) {
        const newOffers = await Offer.find({
          product_name: regExp,
        })
          .skip(numberToSkip)
          .limit(5)
          .select("product_name product_price -_id");
        return res.json(newOffers);
      }
    }

    if (priceMin && priceMax) {
      if (sort) {
        const newOffersMinMax = await Offer.find({
          product_name: regExp,
          product_price: { $gte: priceMin, $lte: priceMax },
        })
          .skip(numberToSkip)
          .limit(5)
          .sort({ product_price: sort.replace("price-", "") })
          .select("product_name product_price -_id");
        return res.json(newOffersMinMax);
      }
      if (!sort) {
        const newOffersMinMax = await Offer.find({
          product_name: regExp,
          product_price: { $gte: priceMin, $lte: priceMax },
        })
          .skip(numberToSkip)
          .limit(5)
          .select("product_name product_price -_id");
        return res.json(newOffersMinMax);
      }
    }

    if (priceMin && !priceMax) {
      if (sort) {
        const newOffersMin = await Offer.find({
          product_name: regExp,
          product_price: { $gte: priceMin },
        })
          .skip(numberToSkip)
          .limit(5)
          .sort({ product_price: sort.replace("price-", "") })
          .select("product_name product_price -_id");
        return res.json(newOffersMin);
      }
      if (!sort) {
        const newOffersMin = await Offer.find({
          product_name: regExp,
          product_price: { $gte: priceMin },
        })
          .skip(numberToSkip)
          .limit(5)
          .select("product_name product_price -_id");
        return res.json(newOffersMin);
      }
    }
    if (priceMax && !priceMin) {
      if (sort) {
        const newOffersMax = await Offer.find({
          product_name: regExp,
          product_price: { $lte: priceMax },
        })
          .skip(numberToSkip)
          .limit(5)
          .sort({ product_price: sort.replace("price-", "") })
          .select("product_name product_price -_id");
        return res.json(newOffersMax);
      }
      if (!sort) {
        const newOffersMax = await Offer.find({
          product_name: regExp,
          product_price: { $lte: priceMax },
        })
          .skip(numberToSkip)
          .select("product_name product_price -_id");
        return res.json(newOffersMax);
      }
    }
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

*/

    // PREMIERE PAGE
    //const results = await Offer.find().limit(5).skip(0);
    // DEUXIEME PAGE
    //const results = await Offer.find().limit(5).skip(5);
    // TROISIEME PAGE
    //const results = await Offer.find().limit(5).skip(10);
    // TITLE
    // const results = await Offer.find({ product_name: title });
    //TITLE ET UN PRIX MAX
    //   const results = await Offer.find({
    //     product_name: title,
    //     product_price: {
    //       $lte: req.query.priceMax,
    //     },
    // }
    // PRIX COMPRIS ENTRE 40 ET 200
    // const results = await Offer.find({
    //   product_price
    //     $gte: req.query.priceMin,
    //     $lte: req.query.priceMax,
    //   },
    // });
    // PRIX CROISSANT
    //const results = await Offer.find().sort({ product_price: 1 });
    //const nbElementTab = results.length;
    //res.json({ results, nbElementTab });
    // PRIX DECROISSANT
    // const results = await Offer.find().sort({ product_price: -1 });
  } catch (error) {
    res.json({ message: error.message });
  }
});

app.get("/", (req, res) => {
  res;
  json({ message: "Welcome on my server" });
});

app.all("*", (req, res) => {
  res.json({ error: "page not found" });
});

app.listen(process.env.PORT, (req, res) => {
  console.log("the server has started");
});
