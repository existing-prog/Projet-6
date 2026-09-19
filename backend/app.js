require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const dns = require('dns');
const Book = require('./models/Book');
const bcrypt = require('bcrypt');
const User = require('./models/User');
dns.setServers(['1.1.1.1', '8.8.8.8']);
const jwt = require('jsonwebtoken');
const auth = require('./middleware/auth');
const multer = require('./middleware/multer-config');
const path = require('path');
const fs = require('fs');
const password = require('./middleware/password');
const sharpConfig = require('./middleware/sharp-config');
const checkBookOwner = require('./middleware/check-book-owner');

const app = express();

mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('Connexion à MongoDB réussie !'))
    .catch((error) => console.log('Connexion à MongoDB échouée !', error));

app.use(express.json());
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  res.setHeader(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content, Accept, Content-Type, Authorization'
  );

  res.setHeader(
    'Access-Control-Allow-Methods',
    'GET, POST, PUT, DELETE, PATCH, OPTIONS'
  );

  next();
});

app.use('/images', express.static(path.join(__dirname, 'images')));

// ============================================================
//                  RÉCUPÉRER TOUS LES LIVRES
// ============================================================

app.get('/api/books', (req, res) => {
    Book.find()
        .then(books => res.status(200).json(books))
        .catch(error => res.status(400).json({ error }));
});

// ============================================================
//                  LIVRES LES MIEUX NOTÉS
// ============================================================

app.get('/api/books/bestrating', (req, res) => {
  Book.find()
    .sort({ averageRating: -1 })
    .limit(3)
    .then(books => res.status(200).json(books))
    .catch(error => res.status(400).json({ error }));
});

// ============================================================
//                   RÉCUPÉRER UN LIVRE
// ============================================================

app.get('/api/books/:id', (req, res) => {
    Book.findOne({ _id: req.params.id })
        .then(book => res.status(200).json(book))
        .catch(error => res.status(404).json({ error }));
});

// ============================================================
//                     AJOUTER UN LIVRE
// ============================================================

app.post('/api/books', auth, multer, sharpConfig, (req, res) => {

  const bookObject = JSON.parse(req.body.book);

  delete bookObject._id;
  delete bookObject.userId;

  const initialRating = bookObject.averageRating;

  const book = new Book({
    ...bookObject,
    userId: req.auth.userId,
    imageUrl: `${req.protocol}://${req.get('host')}/images/${req.file.filename}`,
    ratings: [
      {
        userId: req.auth.userId,
        grade: initialRating
      }
    ],
    averageRating: initialRating
  });

  book.save()
    .then(() => res.status(201).json({ message: 'Livre enregistré !' }))
    .catch(error => res.status(400).json({ error }));
});

// ============================================================
//                     MODIFIER UN LIVRE
// ============================================================

app.put('/api/books/:id', auth, checkBookOwner, multer, sharpConfig, (req, res) => {
  const bookObject = req.file
    ? {
        ...JSON.parse(req.body.book),
        imageUrl: `${req.protocol}://${req.get('host')}/images/${req.file.filename}`
      }
    : { ...req.body };

  delete bookObject.userId;
  delete bookObject.ratings;
  delete bookObject.averageRating;

  const book = req.book;

  if (req.file) {
    const filename = book.imageUrl.split('/images/')[1];

    fs.unlink(`images/${filename}`, (error) => {
      if (error) {
        return res.status(500).json({ error });
      }

      Book.updateOne(
        { _id: req.params.id },
        { ...bookObject, _id: req.params.id }
      )
        .then(() =>
          res.status(200).json({ message: 'Livre modifié !' })
        )
        .catch(error => res.status(400).json({ error }));
    });
  } else {
    Book.updateOne(
      { _id: req.params.id },
      { ...bookObject, _id: req.params.id }
    )
      .then(() =>
        res.status(200).json({ message: 'Livre modifié !' })
      )
      .catch(error => res.status(400).json({ error }));
  }
});

// ============================================================
//                     SUPPRIMER UN LIVRE
// ============================================================

app.delete('/api/books/:id', auth, checkBookOwner, (req, res) => {
  const book = req.book;

  const filename = book.imageUrl.split('/images/')[1];

  fs.unlink(`images/${filename}`, (error) => {
    if (error) {
      return res.status(500).json({ error });
    }

    Book.deleteOne({ _id: req.params.id })
      .then(() => res.status(200).json({ message: 'Livre supprimé !' }))
      .catch(error => res.status(400).json({ error }));
  });
});

// ============================================================
//                      INSCRIPTION
// ============================================================

app.post('/api/auth/signup', password, (req, res) => {
    bcrypt.hash(req.body.password, 10)
        .then(hash => {
            const user = new User({
              email: req.body.email,
              password: hash
            });

            user.save()
                .then(() => res.status(201).json({ message: 'Utilisateur créé !' }))
                .catch(error => res.status(400).json({ error }));
        })
        .catch(error => res.status(500).json({ error }));
});

// ============================================================
//                        CONNEXION
// ============================================================

app.post('/api/auth/login', (req, res) => {
    User.findOne({ email: req.body.email })
        .then(user => {
            if (!user) {
                return res.status(401).json({ error: 'Utilisateur non trouvé !' });
            }

            bcrypt.compare(req.body.password, user.password)
                .then(valid => {
                    if (!valid) {
                        return res.status(401).json({ error: 'Mot de passe incorrect !' });
                    }

                    res.status(200).json({
                        userId: user._id,
                        token: jwt.sign(
                            { userId: user._id },
                            process.env.TOKEN_SECRET,
                            { expiresIn: '24h' }
                        )
                    });
                })
                .catch(error => res.status(500).json({ error }));
        })
        .catch(error => res.status(500).json({ error }));
});

// ============================================================
//                     NOTER UN LIVRE
// ============================================================

app.post('/api/books/:id/rating', auth, (req, res) => {
  const rating = req.body.rating;
  const userId = req.auth.userId;

  if (rating < 0 || rating > 5) {
    return res.status(400).json({ message: 'La note doit être comprise entre 0 et 5' });
  }

  Book.findOne({ _id: req.params.id })
    .then(book => {
      if (!book) {
        return res.status(404).json({ message: 'Livre introuvable' });
      }

      const alreadyRated = book.ratings.find(
        rating => rating.userId === userId
      );

      if (alreadyRated) {
        return res.status(400).json({ message: 'Vous avez déjà noté ce livre' });
      }

      book.ratings.push({
        userId: userId,
        grade: rating
      });

      const total = book.ratings.reduce(
        (sum, rating) => sum + rating.grade,
        0
      );

      book.averageRating = total / book.ratings.length;

      book.save()
        .then(updatedBook => res.status(200).json(updatedBook))
        .catch(error => res.status(400).json({ error }));
    })
    .catch(error => res.status(500).json({ error }));
});




app.use((req, res) => {
    res.json({ message: 'Votre requête a été reçue avec succès !' });
});

module.exports = app;
