import TopicGraph from "./components/TopicGraph";
import styles from "./page.module.css";

const Home = () => {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <h1 className={styles.title}>US Election · Issue Constellation</h1>
        <div className={styles.graph}>
          <TopicGraph />
        </div>
      </main>
    </div>
  );
};

export default Home;
