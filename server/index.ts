import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';

interface ScoreData {
  highScore: number;
  recentScores: number[];
}

const app = express();
const PORT = 42010;
const DATA_FILE = path.join(process.cwd(), 'server', 'data', 'scores.json');
const MAX_RECENT_SCORES = 3;

app.use(cors());
app.use(express.json());

const readScoreData = (): ScoreData => {
  const raw = fs.readFileSync(DATA_FILE, 'utf-8');
  const data = JSON.parse(raw);
  if (!data.recentScores) {
    data.recentScores = [];
  }
  return data;
};

const writeScoreData = (data: ScoreData): void => {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
};

app.get('/api/highscore', (_req, res) => {
  try {
    const data = readScoreData();
    res.json({ highScore: data.highScore });
  } catch (error) {
    res.status(500).json({ error: '读取分数失败' });
  }
});

app.get('/api/recentscores', (_req, res) => {
  try {
    const data = readScoreData();
    res.json({ recentScores: data.recentScores });
  } catch (error) {
    res.status(500).json({ error: '读取最近分数失败' });
  }
});

app.post('/api/highscore', (req, res) => {
  try {
    const { score } = req.body as { score?: number };

    if (typeof score !== 'number' || score < 0) {
      return res.status(400).json({ error: '无效的分数' });
    }

    const data = readScoreData();
    
    data.recentScores.push(score);
    if (data.recentScores.length > MAX_RECENT_SCORES) {
      data.recentScores = data.recentScores.slice(-MAX_RECENT_SCORES);
    }

    let isNewRecord = false;
    if (score > data.highScore) {
      data.highScore = score;
      isNewRecord = true;
    }

    writeScoreData(data);
    res.json({ 
      highScore: data.highScore, 
      isNewRecord, 
      recentScores: data.recentScores 
    });
  } catch (error) {
    res.status(500).json({ error: '保存分数失败' });
  }
});

app.listen(PORT, () => {
  console.log(`服务器运行在 http://localhost:${PORT}`);
});
