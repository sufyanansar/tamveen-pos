// Onboards this POS machine (EGS unit) with ZATCA:
//   npm run onboard -- --otp 123456
// Get the OTP from the Fatoora portal (fatoora.zatca.gov.sa). In the developer sandbox any 6-digit OTP such as 123345 works.
'use strict';
const { loadConfig } = require('./lib/config');
const { service } = require('./lib/service');

const i = process.argv.indexOf('--otp');
const otp = i > -1 ? process.argv[i + 1] : process.env.ZATCA_OTP;
if (!otp) { console.error('Usage: npm run onboard -- --otp <OTP from the Fatoora portal>'); process.exit(1); }

const config = loadConfig();
service(config).onboard(otp, (m) => console.log(m))
  .then((r) => {
    r.results.forEach((x) => { if (x.errors.length || x.warnings.length) console.log(x.sample, { errors: x.errors, warnings: x.warnings }); });
    if (!r.ok) { console.error('Compliance checks failed; no production CSID was requested.'); process.exit(2); }
  })
  .catch((e) => { console.error(e.message); process.exit(1); });
