const express = require('express');

const downloadPdf = require(
  '@/handlers/downloadHandler/downloadPdf'
);

const requireBusinessRole = require(
  '@/middlewares/requireBusinessRole'
);

const { catchErrors } = require('@/handlers/errorHandlers');

const router = express.Router();

const documentRoles = {
  quote: 'sales',
  invoice: 'finance',
  payment: 'finance',
};

router.get(
  '/:directory/:file',

  (req, res, next) => {
    const { directory, file } = req.params;

    if (
      !Object.prototype.hasOwnProperty.call(
        documentRoles,
        directory
      )
    ) {
      return res.status(404).json({
        success: false,
        result: null,
        message: 'Jenis dokumen tidak tersedia.',
      });
    }

    const pattern = new RegExp(
      `^${directory}-([a-fA-F0-9]{24})\\.pdf$`
    );

    const match = pattern.exec(file);

    if (!match) {
      return res.status(400).json({
        success: false,
        result: null,
        message: 'Nama dokumen tidak valid.',
      });
    }

    req.downloadDocument = {
      directory,
      id: match[1],
    };

    return requireBusinessRole(
      documentRoles[directory]
    )(req, res, next);
  },

  catchErrors(async (req, res) => {
    return downloadPdf(req, res, req.downloadDocument);
  })
);

module.exports = router;