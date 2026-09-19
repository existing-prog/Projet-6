const Book = require('../models/Book');

module.exports = (req, res, next) => {
    Book.findOne({ _id: req.params.id })
        .then(book => {
            if (!book) {
                return res.status(404).json({ message: 'Livre introuvable' });
            }

            if (book.userId !== req.auth.userId) {
                return res.status(403).json({ message: 'Non autorisé' });
            }

            req.book = book;
            next();
        })
        .catch(error => res.status(500).json({ error }));
};
