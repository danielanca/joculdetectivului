import parse from "html-react-parser";
import styles from "./Footer.module.scss";
import strings from "./../../strings/strings.json";

export const Footer = () => {
  return (
    <div className={styles.footerOuter}>
      <footer className={styles.footerContainer}>
        <div className={styles.headlineFooter}>
          <h2>{parse(strings.footer.topHeadline)}</h2>
        </div>
        <div className={styles.middleItems}>
          <div className={styles.logoContainer}>
            <img />
          </div>
          <ul>
            <li>Termeni si conditii</li>
            <li>Metode de plata</li>
            <li>Online Dispute Resolution</li>
            <li>ANPC</li>
          </ul>
          <ul>
            <li>Termeni si conditii</li>
            <li>Metode de plata</li>
            <li>Online Dispute Resolution</li>
            <li>ANPC</li>
          </ul>
          <ul>
            <li>Termeni si conditii</li>
            <li>Metode de plata</li>
            <li>Online Dispute Resolution</li>
            <li>ANPC</li>
          </ul>
        </div>
        <div className={styles.drawLine}></div>
      </footer>
    </div>
  );
};
