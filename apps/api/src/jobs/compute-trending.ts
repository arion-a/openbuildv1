import { trendingService } from '../services/trending.service.js';

async function run() {
  console.log('Computing trending ideas...');
  await trendingService.computeTrending();
  console.log('Done.');
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
