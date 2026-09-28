const React = require("react"), RDS = require("react-dom/server"), sharp = require("sharp");
const fa = require("react-icons/fa");
const names = ["FaUserShield","FaMobileAlt","FaBrain","FaBell","FaHandsHelping","FaChartLine","FaLock","FaShieldAlt","FaUsers","FaUserTie","FaHeartbeat","FaDatabase","FaServer","FaCogs","FaLanguage","FaExclamationTriangle","FaCheckCircle","FaRupeeSign","FaBalanceScale","FaGlobeAsia","FaBook","FaEye","FaSyncAlt","FaUserFriends","FaClipboardCheck","FaLightbulb","FaWifi","FaPhoneAlt","FaBuilding","FaFlag","FaCalendarCheck","FaUserMd","FaCode","FaLaptopCode","FaRoute","FaFingerprint"];
(async () => {
  for (const n of names) {
    if (!fa[n]) { console.log("missing", n); continue; }
    for (const [suf, col] of [["w", "#FFFFFF"], ["n", "#1F3A5F"]]) {
      const svg = RDS.renderToStaticMarkup(React.createElement(fa[n], { color: col, size: 256 }));
      await sharp(Buffer.from(svg)).resize(256, 256, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile(`icons/${n}_${suf}.png`);
    }
  }
  console.log("done");
})();
