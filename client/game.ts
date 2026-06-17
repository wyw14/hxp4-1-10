type Color = 'red' | 'yellow' | 'blue' | 'green';
type DifficultyLevel = 'easy' | 'normal' | 'hard' | 'extreme';

const COLORS: Color[] = ['red', 'yellow', 'blue', 'green'];
const MAX_RECENT_SCORES = 3;

const BASE_LIGHT_ON = 600;
const BASE_LIGHT_OFF = 300;
const MIN_SPEED_MULTIPLIER = 0.5;
const MAX_SPEED_MULTIPLIER = 1.6;
const SPEED_STEP = 0.15;

interface HighScoreResponse {
  highScore: number;
  isNewRecord?: boolean;
  recentScores?: number[];
}

interface RecentScoresResponse {
  recentScores: number[];
}

interface DifficultyResult {
  speedMultiplier: number;
  level: DifficultyLevel;
  reason: string;
  reasonType: 'normal' | 'speed-up' | 'speed-down';
}

class ColorMemoryGame {
  private sequence: Color[] = [];
  private playerIndex: number = 0;
  private isPlaying: boolean = false;
  private isShowingSequence: boolean = false;
  private level: number = 0;
  private highScore: number = 0;
  private recentScores: number[] = [];
  private currentSpeedMultiplier: number = 1.0;

  private readonly buttons: NodeListOf<HTMLButtonElement>;
  private readonly startBtn: HTMLButtonElement;
  private readonly currentLevelEl: HTMLElement;
  private readonly highScoreEl: HTMLElement;
  private readonly gameStatusEl: HTMLElement;
  private readonly difficultyLevelEl: HTMLElement;
  private readonly speedValueEl: HTMLElement;
  private readonly recentScoresListEl: HTMLElement;
  private readonly difficultyReasonEl: HTMLElement;

  constructor() {
    this.buttons = document.querySelectorAll('.color-btn');
    this.startBtn = document.getElementById('start-btn') as HTMLButtonElement;
    this.currentLevelEl = document.getElementById('current-level') as HTMLElement;
    this.highScoreEl = document.getElementById('high-score') as HTMLElement;
    this.gameStatusEl = document.getElementById('game-status') as HTMLElement;
    this.difficultyLevelEl = document.getElementById('difficulty-level') as HTMLElement;
    this.speedValueEl = document.getElementById('speed-value') as HTMLElement;
    this.recentScoresListEl = document.getElementById('recent-scores-list') as HTMLElement;
    this.difficultyReasonEl = document.getElementById('difficulty-reason') as HTMLElement;

    this.init();
  }

  private async init(): Promise<void> {
    this.setupEventListeners();
    await Promise.all([this.fetchHighScore(), this.fetchRecentScores()]);
    this.updateDifficulty();
  }

  private setupEventListeners(): void {
    this.startBtn.addEventListener('click', () => this.startGame());

    this.buttons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const color = (e.target as HTMLButtonElement).dataset.color as Color;
        this.handlePlayerInput(color);
      });
    });
  }

  private async fetchHighScore(): Promise<void> {
    try {
      const response = await fetch('/api/highscore');
      const data = await response.json() as HighScoreResponse;
      this.highScore = data.highScore;
      this.highScoreEl.textContent = this.highScore.toString();
    } catch (error) {
      console.error('获取最高分失败:', error);
    }
  }

  private async fetchRecentScores(): Promise<void> {
    try {
      const response = await fetch('/api/recentscores');
      const data = await response.json() as RecentScoresResponse;
      this.recentScores = data.recentScores || [];
    } catch (error) {
      console.error('获取最近分数失败:', error);
      this.recentScores = [];
    }
  }

  private async saveHighScore(score: number): Promise<void> {
    try {
      const response = await fetch('/api/highscore', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ score }),
      });
      const data = await response.json() as HighScoreResponse;
      this.highScore = data.highScore;
      this.highScoreEl.textContent = this.highScore.toString();

      if (data.recentScores) {
        this.recentScores = data.recentScores;
      }

      if (data.isNewRecord) {
        this.showStatus('🎉 新纪录！', 'success');
      }
    } catch (error) {
      console.error('保存最高分失败:', error);
    }
  }

  private calculateDifficulty(): DifficultyResult {
    const scores = this.recentScores;
    let multiplier = 1.0;
    let reason = '暂无数据，使用默认速度';
    let reasonType: DifficultyResult['reasonType'] = 'normal';

    if (scores.length === 0) {
      return { speedMultiplier: 1.0, level: 'normal', reason, reasonType: 'normal' };
    }

    if (scores.length === 1) {
      const s = scores[0];
      if (s >= 8) {
        multiplier = 1.0 - SPEED_STEP;
        reason = `上一局达到 ${s} 关，表现优秀，略微加快速度`;
        reasonType = 'speed-up';
      } else if (s <= 2) {
        multiplier = 1.0 + SPEED_STEP;
        reason = `上一局仅 ${s} 关，放慢速度帮助适应`;
        reasonType = 'speed-down';
      } else {
        reason = `上一局 ${s} 关，使用标准速度`;
      }
    } else if (scores.length >= 2) {
      const isConsecutiveUp = this.isConsecutiveIncrease(scores);
      const isConsecutiveDown = this.isConsecutiveDecrease(scores);
      const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;

      if (isConsecutiveUp && scores.length >= 2) {
        const steps = scores.length - 1;
        multiplier = 1.0 - (SPEED_STEP * steps);
        const diff = scores[scores.length - 1] - scores[0];
        reason = `连续 ${steps} 局进步（共提升 ${diff} 关），加快速度挑战更高难度`;
        reasonType = 'speed-up';
      } else if (isConsecutiveDown && scores.length >= 2) {
        const steps = scores.length - 1;
        multiplier = 1.0 + (SPEED_STEP * steps);
        const diff = scores[0] - scores[scores.length - 1];
        reason = `连续 ${steps} 局下滑（共下降 ${diff} 关），放慢速度让你找回状态`;
        reasonType = 'speed-down';
      } else {
        const latest = scores[scores.length - 1];
        const prev = scores[scores.length - 2];
        if (latest > prev) {
          multiplier = 1.0 - SPEED_STEP * 0.5;
          reason = `上一局进步（${prev}→${latest} 关），稍微加快速度`;
          reasonType = 'speed-up';
        } else if (latest < prev) {
          multiplier = 1.0 + SPEED_STEP * 0.5;
          reason = `上一局退步（${prev}→${latest} 关），稍微放慢速度`;
          reasonType = 'speed-down';
        } else if (avgScore >= 8) {
          multiplier = 1.0 - SPEED_STEP;
          reason = `近三局平均 ${avgScore.toFixed(1)} 关，表现稳定优秀，加快速度`;
          reasonType = 'speed-up';
        } else if (avgScore <= 3) {
          multiplier = 1.0 + SPEED_STEP;
          reason = `近三局平均 ${avgScore.toFixed(1)} 关，放慢速度帮助提升`;
          reasonType = 'speed-down';
        } else {
          reason = `近三局平均 ${avgScore.toFixed(1)} 关，使用标准速度`;
        }
      }
    }

    multiplier = Math.max(MIN_SPEED_MULTIPLIER, Math.min(MAX_SPEED_MULTIPLIER, multiplier));

    let level: DifficultyLevel;
    if (multiplier <= 0.65) {
      level = 'extreme';
    } else if (multiplier <= 0.85) {
      level = 'hard';
    } else if (multiplier <= 1.15) {
      level = 'normal';
    } else {
      level = 'easy';
    }

    return { speedMultiplier: multiplier, level, reason, reasonType };
  }

  private isConsecutiveIncrease(scores: number[]): boolean {
    for (let i = 1; i < scores.length; i++) {
      if (scores[i] <= scores[i - 1]) return false;
    }
    return true;
  }

  private isConsecutiveDecrease(scores: number[]): boolean {
    for (let i = 1; i < scores.length; i++) {
      if (scores[i] >= scores[i - 1]) return false;
    }
    return true;
  }

  private updateDifficulty(): void {
    const result = this.calculateDifficulty();
    this.currentSpeedMultiplier = result.speedMultiplier;
    this.updateDifficultyUI(result);
  }

  private updateDifficultyUI(result: DifficultyResult): void {
    const levelTexts: Record<DifficultyLevel, string> = {
      easy: '简单',
      normal: '标准',
      hard: '困难',
      extreme: '极限',
    };
    this.difficultyLevelEl.textContent = levelTexts[result.level];
    this.difficultyLevelEl.className = 'difficulty-level ' + result.level;

    const speedPercent = Math.round((1 / result.speedMultiplier) * 100);
    this.speedValueEl.textContent = `${speedPercent}%`;
    this.speedValueEl.className = 'speed-value';
    if (result.speedMultiplier < 1) {
      this.speedValueEl.classList.add('fast');
    } else if (result.speedMultiplier > 1) {
      this.speedValueEl.classList.add('slow');
    }

    this.updateRecentScoresUI();

    this.difficultyReasonEl.textContent = result.reason;
    this.difficultyReasonEl.className = 'difficulty-reason';
    if (result.reasonType === 'speed-up') {
      this.difficultyReasonEl.classList.add('speed-up');
    } else if (result.reasonType === 'speed-down') {
      this.difficultyReasonEl.classList.add('speed-down');
    }
  }

  private updateRecentScoresUI(): void {
    const slots = this.recentScoresListEl.querySelectorAll('.recent-score');
    slots.forEach((slot, idx) => {
      if (idx < this.recentScores.length) {
        const score = this.recentScores[idx];
        slot.textContent = score.toString();
        slot.className = 'recent-score';

        if (idx > 0) {
          const prev = this.recentScores[idx - 1];
          if (score > prev) {
            slot.classList.add('up');
          } else if (score < prev) {
            slot.classList.add('down');
          }
        }
      } else {
        slot.textContent = '-';
        slot.className = 'recent-score empty';
      }
    });
  }

  private startGame(): void {
    this.sequence = [];
    this.playerIndex = 0;
    this.level = 0;
    this.isPlaying = true;
    this.currentLevelEl.textContent = '0';
    
    this.setButtonsDisabled(true);
    this.startBtn.disabled = true;
    
    this.showStatus('游戏开始！', 'playing');
    this.nextRound();
  }

  private nextRound(): void {
    this.level++;
    this.currentLevelEl.textContent = this.level.toString();
    this.playerIndex = 0;

    const randomColor = COLORS[Math.floor(Math.random() * COLORS.length)];
    this.sequence.push(randomColor);

    this.showStatus(`第 ${this.level} 关 - 记住序列`, 'playing');
    this.showSequence();
  }

  private async showSequence(): Promise<void> {
    this.isShowingSequence = true;
    this.setButtonsDisabled(true);

    const lightOn = Math.round(BASE_LIGHT_ON * this.currentSpeedMultiplier);
    const lightOff = Math.round(BASE_LIGHT_OFF * this.currentSpeedMultiplier);

    await this.delay(500);

    for (let i = 0; i < this.sequence.length; i++) {
      const color = this.sequence[i];
      await this.lightUpButton(color, lightOn);
      
      if (i < this.sequence.length - 1) {
        await this.delay(lightOff);
      }
    }

    this.isShowingSequence = false;
    this.setButtonsDisabled(false);
    this.showStatus('请按顺序点击按钮', 'playing');
  }

  private async lightUpButton(color: Color, duration: number): Promise<void> {
    const button = this.getButtonByColor(color);
    if (!button) return;

    button.classList.add('active');
    await this.delay(duration);
    button.classList.remove('active');
  }

  private getButtonByColor(color: Color): HTMLButtonElement | null {
    return document.querySelector(`.color-btn[data-color="${color}"]`);
  }

  private async handlePlayerInput(color: Color): Promise<void> {
    if (!this.isPlaying || this.isShowingSequence) return;

    const expectedColor = this.sequence[this.playerIndex];
    const button = this.getButtonByColor(color);

    if (color === expectedColor) {
      button?.classList.add('correct');
      await this.delay(200);
      button?.classList.remove('correct');

      this.playerIndex++;

      if (this.playerIndex === this.sequence.length) {
        this.showStatus('正确！准备下一关...', 'success');
        this.setButtonsDisabled(true);
        await this.delay(1000);
        this.nextRound();
      }
    } else {
      button?.classList.add('wrong');
      await this.delay(500);
      button?.classList.remove('wrong');

      this.gameOver();
    }
  }

  private async gameOver(): Promise<void> {
    this.isPlaying = false;
    this.setButtonsDisabled(true);
    this.startBtn.disabled = false;

    const finalScore = this.level - 1;
    this.showStatus(`游戏结束！你完成了 ${finalScore} 关`, 'gameover');

    await this.saveHighScore(finalScore);
    this.updateDifficulty();
  }

  private setButtonsDisabled(disabled: boolean): void {
    this.buttons.forEach(btn => {
      btn.disabled = disabled;
    });
  }

  private showStatus(message: string, type: 'playing' | 'gameover' | 'success' | '' = ''): void {
    this.gameStatusEl.textContent = message;
    this.gameStatusEl.className = 'game-status';
    if (type) {
      this.gameStatusEl.classList.add(type);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

new ColorMemoryGame();
