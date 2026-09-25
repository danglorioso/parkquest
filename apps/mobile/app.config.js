const appJson = require('./app.json');

// google-services.json is gitignored (it previously leaked, see .gitignore comment)
// and isn't uploaded to EAS Build's git archive. GOOGLE_SERVICES_JSON is an EAS
// file environment variable that resolves to a local path at build time.
module.exports = ({ config }) => ({
  ...config,
  ...appJson.expo,
  android: {
    ...appJson.expo.android,
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON || appJson.expo.android.googleServicesFile,
  },
});
