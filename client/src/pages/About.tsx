function About() {
  return (
    <div className="page about-page">
      <h2>About BrickWise</h2>

      <section className="about-section">
        <h3>Legal Disclaimer</h3>
        <p>
          BrickWise is not affiliated with, endorsed by, or sponsored by the
          LEGO Group. This application is an independent tool for managing
          collections of LEGO-compatible bricks and is not produced or endorsed
          by the LEGO Group.
        </p>
        <p>
          The term "LEGO" is used here solely to describe compatibility with
          LEGO building elements. LEGO is a trademark of the LEGO Group of
          companies, which does not authorize, sponsor, or endorse this
          application.
        </p>
      </section>

      <section className="about-section">
        <h3>Trademark Acknowledgment</h3>
        <p>
          LEGO&reg; is a trademark of the LEGO Group. The LEGO Group does not
          sponsor, authorize, or endorse this application.
        </p>
      </section>

      <section className="about-section">
        <h3>Data Attribution</h3>
        <p>
          Parts and sets catalog data provided by{" "}
          <a
            href="https://rebrickable.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            Rebrickable
          </a>
          .
        </p>
        <p>
          Pricing and availability data provided by{" "}
          <a
            href="https://www.bricklink.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            BrickLink
          </a>{" "}
          and{" "}
          <a
            href="https://www.brickowl.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            BrickOwl
          </a>
          .
        </p>
      </section>
    </div>
  );
}

export default About;
