import { Noto_Sans_KR, Plus_Jakarta_Sans } from 'next/font/google';
import TopicGraph from '@/app/components/TopicGraph';
import styles from './page.module.css';

const notoSansKr = Noto_Sans_KR({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  display: 'swap',
  variable: '--font-noto-sans-kr',
});

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  display: 'swap',
  variable: '--font-plus-jakarta',
});

const Home = () => {
  return (
    <div
      className={`${styles.page} ${plusJakarta.variable} ${notoSansKr.variable}`}
    >
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
