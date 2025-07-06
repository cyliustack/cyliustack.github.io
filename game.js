// WebGL Game - Warriors Hunter
class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.gl = this.canvas.getContext('webgl') || this.canvas.getContext('experimental-webgl');
        
        if (!this.gl) {
            alert('WebGL not supported!');
            return;
        }
        
        this.score = 0;
        this.health = 100;
        this.gameOver = false;
        this.paused = false;
        this.enemies = [];
        this.bullets = [];
        this.lastEnemySpawn = 0;
        // Get difficulty setting from localStorage
        this.difficulty = localStorage.getItem('gameDifficulty') || 'medium';
        
        // Set game parameters based on difficulty
        this.setDifficultySettings();
        this.gameStartTime = Date.now();
        
        // Sound effects
        this.sounds = {};
        this.initSounds();
        
        this.player = {
            x: 400,
            y: 300,
            size: 20,
            speed: 3,
            angle: 0,
            weapon: {
                damage: 25,
                fireRate: 300,
                lastShot: 0,
                ammo: 30,
                maxAmmo: 30,
                type: 'laserSword'
            }
        };
        
        this.keys = {};
        this.mouse = { x: 0, y: 0 };
        
        this.initWebGL();
        this.setupEventListeners();
        this.gameLoop();
    }
    
    setDifficultySettings() {
        switch(this.difficulty) {
            case 'easy':
                this.enemySpawnRate = 2000; // Slower spawning
                this.maxEnemies = 20; // Fewer enemies
                this.player.health = 150; // More health
                this.player.weapon.damage = 30; // More damage
                this.player.weapon.maxAmmo = 40; // More ammo
                break;
            case 'medium':
                this.enemySpawnRate = 1500; // Normal spawning
                this.maxEnemies = 30; // Normal enemies
                this.player.health = 100; // Normal health
                this.player.weapon.damage = 25; // Normal damage
                this.player.weapon.maxAmmo = 30; // Normal ammo
                break;
            case 'hard':
                this.enemySpawnRate = 800; // Fast spawning
                this.maxEnemies = 50; // More enemies
                this.player.health = 80; // Less health
                this.player.weapon.damage = 20; // Less damage
                this.player.weapon.maxAmmo = 25; // Less ammo
                break;
            default:
                this.enemySpawnRate = 1500;
                this.maxEnemies = 30;
                this.player.health = 100;
                this.player.weapon.damage = 25;
                this.player.weapon.maxAmmo = 30;
        }
        this.health = this.player.health;
        this.player.weapon.ammo = this.player.weapon.maxAmmo;
    }
    
    initSounds() {
        // Create audio context for sound effects
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.log('Audio not supported');
            this.audioContext = null;
        }
    }
    
    playSound(frequency, duration, type = 'sine') {
        if (!this.audioContext) return;
        
        try {
            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            
            oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
            oscillator.type = type;
            
            gainNode.gain.setValueAtTime(0.1, this.audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration);
            
            oscillator.start(this.audioContext.currentTime);
            oscillator.stop(this.audioContext.currentTime + duration);
        } catch (e) {
            console.log('Sound playback failed');
        }
    }
    
    playHitSound() {
        // Laser sword hit sound - high frequency sweep
        this.playSound(800, 0.1, 'sawtooth');
        setTimeout(() => this.playSound(600, 0.1, 'sawtooth'), 50);
    }
    
    playShootSound() {
        // Laser sword swing sound
        this.playSound(400, 0.2, 'square');
    }
    
    playEnemyDeathSound() {
        // Enemy death sound
        this.playSound(200, 0.3, 'triangle');
    }
    
    initWebGL() {
        this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        this.gl.clearColor(0.4, 0.8, 0.4, 1.0); // Light natural green background
        this.gl.enable(this.gl.BLEND);
        this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);
        
        // Create shaders
        const vertexShaderSource = `
            attribute vec2 a_position;
            attribute vec4 a_color;
            uniform vec2 u_resolution;
            varying vec4 v_color;
            
            void main() {
                vec2 zeroToOne = a_position / u_resolution;
                vec2 zeroToTwo = zeroToOne * 2.0;
                vec2 clipSpace = zeroToTwo - 1.0;
                gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);
                v_color = a_color;
            }
        `;
        
        const fragmentShaderSource = `
            precision mediump float;
            varying vec4 v_color;
            
            void main() {
                gl_FragColor = v_color;
            }
        `;
        
        this.program = this.createProgram(vertexShaderSource, fragmentShaderSource);
        this.gl.useProgram(this.program);
        
        // Get attribute and uniform locations
        this.positionLocation = this.gl.getAttribLocation(this.program, 'a_position');
        this.colorLocation = this.gl.getAttribLocation(this.program, 'a_color');
        this.resolutionLocation = this.gl.getUniformLocation(this.program, 'u_resolution');
        
        this.gl.uniform2f(this.resolutionLocation, this.canvas.width, this.canvas.height);
    }
    
    createShader(type, source) {
        const shader = this.gl.createShader(type);
        this.gl.shaderSource(shader, source);
        this.gl.compileShader(shader);
        
        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
            console.error('Shader compilation error:', this.gl.getShaderInfoLog(shader));
            this.gl.deleteShader(shader);
            return null;
        }
        return shader;
    }
    
    createProgram(vertexSource, fragmentSource) {
        const vertexShader = this.createShader(this.gl.VERTEX_SHADER, vertexSource);
        const fragmentShader = this.createShader(this.gl.FRAGMENT_SHADER, fragmentSource);
        
        const program = this.gl.createProgram();
        this.gl.attachShader(program, vertexShader);
        this.gl.attachShader(program, fragmentShader);
        this.gl.linkProgram(program);
        
        if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
            console.error('Program linking error:', this.gl.getProgramInfoLog(program));
            return null;
        }
        return program;
    }
    
    setupEventListeners() {
        // Keyboard events
        document.addEventListener('keydown', (e) => {
            this.keys[e.key.toLowerCase()] = true;
            if (e.key === ' ') {
                e.preventDefault();
                this.togglePause();
            }
            if (e.key === 'Enter') {
                e.preventDefault();
                if (this.gameOver) {
                    this.restartGame();
                }
            }
            if (e.key === 'r') {
                e.preventDefault();
                this.reload();
            }
        });
        
        document.addEventListener('keyup', (e) => {
            this.keys[e.key.toLowerCase()] = false;
        });
        
        // Mouse events
        this.canvas.addEventListener('mousemove', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            this.mouse.x = e.clientX - rect.left;
            this.mouse.y = e.clientY - rect.top;
        });
        
        this.canvas.addEventListener('click', (e) => {
            e.preventDefault();
            if (!this.paused && !this.gameOver) {
                this.shoot();
            }
        });
    }
    
    updatePlayer() {
        // Movement using arrow keys
        if (this.keys['arrowup'] || this.keys['w']) this.player.y -= this.player.speed;
        if (this.keys['arrowdown'] || this.keys['s']) this.player.y += this.player.speed;
        if (this.keys['arrowleft'] || this.keys['a']) this.player.x -= this.player.speed;
        if (this.keys['arrowright'] || this.keys['d']) this.player.x += this.player.speed;
        
        // Keep player in bounds
        this.player.x = Math.max(this.player.size, Math.min(this.canvas.width - this.player.size, this.player.x));
        this.player.y = Math.max(this.player.size, Math.min(this.canvas.height - this.player.size, this.player.y));
        
        // Calculate angle to mouse
        const dx = this.mouse.x - this.player.x;
        const dy = this.mouse.y - this.player.y;
        this.player.angle = Math.atan2(dy, dx);
    }
    
    shoot() {
        const now = Date.now();
        if (now - this.player.weapon.lastShot < this.player.weapon.fireRate || this.player.weapon.ammo <= 0) {
            return;
        }
        
        this.player.weapon.lastShot = now;
        this.player.weapon.ammo--;
        
        // Play laser sword swing sound
        this.playShootSound();
        
        const speed = 12; // Faster laser sword projectiles
        const bullet = {
            x: this.player.x,
            y: this.player.y,
            vx: Math.cos(this.player.angle) * speed,
            vy: Math.sin(this.player.angle) * speed,
            size: 4, // Slightly larger laser beam
            life: 40, // Shorter range but more powerful
            type: 'laserBeam'
        };
        
        this.bullets.push(bullet);
    }
    
    reload() {
        this.player.weapon.ammo = this.player.weapon.maxAmmo;
    }
    
    togglePause() {
        if (!this.gameOver) {
            this.paused = !this.paused;
        }
    }
    
    spawnEnemy() {
        const now = Date.now();
        
        // Dynamic spawn rate - gets faster over time but more gradually
        const gameTime = (now - this.gameStartTime) / 1000; // seconds
        const dynamicSpawnRate = Math.max(800, this.enemySpawnRate - (gameTime * 0.5)); // Minimum 800ms, slower increase
        
        if (now - this.lastEnemySpawn < dynamicSpawnRate) return;
        
        this.lastEnemySpawn = now;
        
        // Random spawn from anywhere on screen or just outside
        let x, y;
        const spawnType = Math.random();
        
        if (spawnType < 0.7) {
            // 70% chance to spawn from edges
            const side = Math.floor(Math.random() * 4);
            switch(side) {
                case 0: // top
                    x = Math.random() * this.canvas.width;
                    y = -30;
                    break;
                case 1: // right
                    x = this.canvas.width + 30;
                    y = Math.random() * this.canvas.height;
                    break;
                case 2: // bottom
                    x = Math.random() * this.canvas.width;
                    y = this.canvas.height + 30;
                    break;
                case 3: // left
                    x = -30;
                    y = Math.random() * this.canvas.height;
                    break;
            }
        } else {
            // 30% chance to spawn randomly anywhere on screen
            x = Math.random() * this.canvas.width;
            y = Math.random() * this.canvas.height;
        }
        
        // Don't spawn too close to player
        const distanceToPlayer = Math.sqrt((x - this.player.x) ** 2 + (y - this.player.y) ** 2);
        if (distanceToPlayer < 100) {
            return; // Skip this spawn if too close to player
        }
        
        // Limit maximum enemies on screen
        if (this.enemies.length >= this.maxEnemies) return;
        
        // Enemy properties based on difficulty
        let enemySpeed, enemyHealth, enemySize;
        
        switch(this.difficulty) {
            case 'easy':
                enemySpeed = 0.2 + Math.random() * 0.8; // Slower enemies
                enemyHealth = 10 + Math.random() * 15; // Less health
                enemySize = 18 + Math.random() * 12; // Smaller enemies
                break;
            case 'medium':
                enemySpeed = 0.3 + Math.random() * 1.2; // Normal speed
                enemyHealth = 15 + Math.random() * 20; // Normal health
                enemySize = 20 + Math.random() * 15; // Normal size
                break;
            case 'hard':
                enemySpeed = 0.5 + Math.random() * 1.8; // Faster enemies
                enemyHealth = 20 + Math.random() * 25; // More health
                enemySize = 22 + Math.random() * 18; // Larger enemies
                break;
            default:
                enemySpeed = 0.3 + Math.random() * 1.2;
                enemyHealth = 15 + Math.random() * 20;
                enemySize = 20 + Math.random() * 15;
        }
        
        const enemy = {
            x: x,
            y: y,
            size: enemySize,
            speed: enemySpeed,
            health: enemyHealth,
            maxHealth: enemyHealth,
            type: 'dinosaur',
            dinoType: Math.floor(Math.random() * 5) // Random dinosaur type
        };
        
        this.enemies.push(enemy);
    }
    
    updateEnemies() {
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const enemy = this.enemies[i];
            
            // Move towards player
            const dx = this.player.x - enemy.x;
            const dy = this.player.y - enemy.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance > 0) {
                enemy.x += (dx / distance) * enemy.speed;
                enemy.y += (dy / distance) * enemy.speed;
            }
            
            // Check collision with player
            const playerDistance = Math.sqrt(
                (enemy.x - this.player.x) ** 2 + (enemy.y - this.player.y) ** 2
            );
            
            if (playerDistance < enemy.size + this.player.size) {
                this.health -= 1;
                if (this.health <= 0) {
                    this.endGame();
                }
            }
        }
    }
    
    updateBullets() {
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const bullet = this.bullets[i];
            
            bullet.x += bullet.vx;
            bullet.y += bullet.vy;
            bullet.life--;
            
            // Remove bullets that are off screen or expired
            if (bullet.life <= 0 || 
                bullet.x < 0 || bullet.x > this.canvas.width ||
                bullet.y < 0 || bullet.y > this.canvas.height) {
                this.bullets.splice(i, 1);
                continue;
            }
            
            // Check collision with enemies
            for (let j = this.enemies.length - 1; j >= 0; j--) {
                const enemy = this.enemies[j];
                const distance = Math.sqrt(
                    (bullet.x - enemy.x) ** 2 + (bullet.y - enemy.y) ** 2
                );
                
                if (distance < enemy.size + bullet.size) {
                    enemy.health -= this.player.weapon.damage;
                    
                    // Play hit sound
                    this.playHitSound();
                    
                    if (enemy.health <= 0) {
                        this.enemies.splice(j, 1);
                        this.score += 100;
                        // Play death sound
                        this.playEnemyDeathSound();
                    }
                    
                    this.bullets.splice(i, 1);
                    break;
                }
            }
        }
    }
    
    drawCircle(x, y, radius, color) {
        const segments = 32;
        const vertices = [];
        const colors = [];
        
        for (let i = 0; i <= segments; i++) {
            const angle = (i / segments) * Math.PI * 2;
            const px = x + Math.cos(angle) * radius;
            const py = y + Math.sin(angle) * radius;
            
            vertices.push(px, py);
            colors.push(color[0], color[1], color[2], color[3]);
        }
        
        const vertexBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, vertexBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(vertices), this.gl.STATIC_DRAW);
        
        const colorBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, colorBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(colors), this.gl.STATIC_DRAW);
        
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, vertexBuffer);
        this.gl.enableVertexAttribArray(this.positionLocation);
        this.gl.vertexAttribPointer(this.positionLocation, 2, this.gl.FLOAT, false, 0, 0);
        
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, colorBuffer);
        this.gl.enableVertexAttribArray(this.colorLocation);
        this.gl.vertexAttribPointer(this.colorLocation, 4, this.gl.FLOAT, false, 0, 0);
        
        this.gl.drawArrays(this.gl.TRIANGLE_FAN, 0, segments + 1);
    }
    
    drawPlayer() {
        // Player body
        this.drawCircle(this.player.x, this.player.y, this.player.size, [0.2, 0.6, 1.0, 1.0]);
        
        // Laser Sword
        const swordLength = 40;
        const swordTipX = this.player.x + Math.cos(this.player.angle) * swordLength;
        const swordTipY = this.player.y + Math.sin(this.player.angle) * swordLength;
        const swordBaseX = this.player.x + Math.cos(this.player.angle) * 15;
        const swordBaseY = this.player.y + Math.sin(this.player.angle) * 15;
        
        // Sword handle
        this.drawCircle(swordBaseX, swordBaseY, 3, [0.4, 0.4, 0.4, 1.0]);
        
        // Laser blade - glowing effect
        const bladeWidth = 2;
        const bladeLength = swordLength - 15;
        
        // Blade glow effect
        for (let i = 0; i < 3; i++) {
            const glowAlpha = 0.8 - (i * 0.2);
            const glowWidth = bladeWidth + (i * 2);
            this.drawLaserBlade(
                swordBaseX, swordBaseY, 
                swordTipX, swordTipY, 
                glowWidth, 
                [0.0, 1.0, 0.0, glowAlpha] // Green laser color
            );
        }
        
        // Health bar
        const barWidth = 40;
        const barHeight = 4;
        const barX = this.player.x - barWidth / 2;
        const barY = this.player.y - this.player.size - 10;
        
        // Background
        this.drawRect(barX, barY, barWidth, barHeight, [0.3, 0.3, 0.3, 1.0]);
        // Health
        const healthWidth = (this.health / 100) * barWidth;
        this.drawRect(barX, barY, healthWidth, barHeight, [0.2, 0.8, 0.2, 1.0]);
    }
    
    drawEnemies() {
        this.enemies.forEach(enemy => {
            // Assign dinosaur type based on enemy index or random
            const dinoType = enemy.dinoType || Math.floor(Math.random() * 5);
            enemy.dinoType = dinoType;
            
            switch(dinoType) {
                case 0: // T-Rex
                    this.drawTRex(enemy);
                    break;
                case 1: // Triceratops
                    this.drawTriceratops(enemy);
                    break;
                case 2: // Stegosaurus
                    this.drawStegosaurus(enemy);
                    break;
                case 3: // Velociraptor
                    this.drawVelociraptor(enemy);
                    break;
                case 4: // Brachiosaurus
                    this.drawBrachiosaurus(enemy);
                    break;
                default:
                    this.drawTRex(enemy);
            }
            
            // Health bar
            const barWidth = enemy.size * 2;
            const barHeight = 3;
            const barX = enemy.x - barWidth / 2;
            const barY = enemy.y - enemy.size - 8;
            
            // Background
            this.drawRect(barX, barY, barWidth, barHeight, [0.3, 0.3, 0.3, 1.0]);
            // Health
            const healthWidth = (enemy.health / enemy.maxHealth) * barWidth;
            this.drawRect(barX, barY, healthWidth, barHeight, [0.8, 0.2, 0.2, 1.0]);
        });
    }
    
    drawTRex(enemy) {
        // T-Rex body (dark green)
        this.drawCircle(enemy.x, enemy.y, enemy.size, [0.1, 0.4, 0.1, 1.0]);
        
        // T-Rex head (larger, darker)
        const headSize = enemy.size * 1.2;
        this.drawCircle(enemy.x + enemy.size * 0.8, enemy.y, headSize, [0.05, 0.3, 0.05, 1.0]);
        
        // T-Rex arms (small)
        const armSize = enemy.size * 0.3;
        this.drawCircle(enemy.x + enemy.size * 0.6, enemy.y - enemy.size * 0.5, armSize, [0.1, 0.4, 0.1, 1.0]);
        this.drawCircle(enemy.x + enemy.size * 0.6, enemy.y + enemy.size * 0.5, armSize, [0.1, 0.4, 0.1, 1.0]);
        
        // T-Rex eyes (red)
        this.drawCircle(enemy.x + enemy.size * 1.3, enemy.y - enemy.size * 0.3, 3, [0.8, 0.1, 0.1, 1.0]);
        this.drawCircle(enemy.x + enemy.size * 1.3, enemy.y + enemy.size * 0.3, 3, [0.8, 0.1, 0.1, 1.0]);
    }
    
    drawTriceratops(enemy) {
        // Triceratops body (brown)
        this.drawCircle(enemy.x, enemy.y, enemy.size, [0.6, 0.4, 0.2, 1.0]);
        
        // Triceratops head (larger)
        const headSize = enemy.size * 1.1;
        this.drawCircle(enemy.x + enemy.size * 0.7, enemy.y, headSize, [0.5, 0.3, 0.1, 1.0]);
        
        // Triceratops horns (three horns)
        const hornSize = enemy.size * 0.4;
        this.drawCircle(enemy.x + enemy.size * 1.2, enemy.y - enemy.size * 0.4, hornSize, [0.8, 0.6, 0.4, 1.0]); // Left horn
        this.drawCircle(enemy.x + enemy.size * 1.2, enemy.y + enemy.size * 0.4, hornSize, [0.8, 0.6, 0.4, 1.0]); // Right horn
        this.drawCircle(enemy.x + enemy.size * 1.4, enemy.y, hornSize * 0.7, [0.8, 0.6, 0.4, 1.0]); // Center horn
        
        // Triceratops frill (back of head)
        const frillSize = enemy.size * 0.8;
        this.drawCircle(enemy.x + enemy.size * 0.3, enemy.y, frillSize, [0.7, 0.5, 0.3, 1.0]);
    }
    
    drawStegosaurus(enemy) {
        // Stegosaurus body (olive green)
        this.drawCircle(enemy.x, enemy.y, enemy.size, [0.4, 0.5, 0.2, 1.0]);
        
        // Stegosaurus head (smaller)
        const headSize = enemy.size * 0.8;
        this.drawCircle(enemy.x - enemy.size * 0.8, enemy.y, headSize, [0.3, 0.4, 0.1, 1.0]);
        
        // Stegosaurus plates (back spikes)
        for (let i = 0; i < 5; i++) {
            const plateX = enemy.x + (i - 2) * enemy.size * 0.3;
            const plateY = enemy.y - enemy.size * 0.8;
            const plateSize = enemy.size * 0.4;
            this.drawCircle(plateX, plateY, plateSize, [0.6, 0.7, 0.3, 1.0]);
        }
        
        // Stegosaurus tail spikes
        for (let i = 0; i < 3; i++) {
            const spikeX = enemy.x + enemy.size * 0.8 + i * enemy.size * 0.2;
            const spikeY = enemy.y + (i - 1) * enemy.size * 0.3;
            const spikeSize = enemy.size * 0.3;
            this.drawCircle(spikeX, spikeY, spikeSize, [0.6, 0.7, 0.3, 1.0]);
        }
    }
    
    drawVelociraptor(enemy) {
        // Velociraptor body (dark gray)
        this.drawCircle(enemy.x, enemy.y, enemy.size, [0.3, 0.3, 0.3, 1.0]);
        
        // Velociraptor head (small, pointed)
        const headSize = enemy.size * 0.7;
        this.drawCircle(enemy.x + enemy.size * 0.6, enemy.y, headSize, [0.2, 0.2, 0.2, 1.0]);
        
        // Velociraptor eyes (yellow)
        this.drawCircle(enemy.x + enemy.size * 1.1, enemy.y - enemy.size * 0.2, 2, [1.0, 1.0, 0.0, 1.0]);
        this.drawCircle(enemy.x + enemy.size * 1.1, enemy.y + enemy.size * 0.2, 2, [1.0, 1.0, 0.0, 1.0]);
        
        // Velociraptor claws (on feet)
        for (let i = 0; i < 3; i++) {
            const clawX = enemy.x + (i - 1) * enemy.size * 0.3;
            const clawY = enemy.y + enemy.size * 0.6;
            const clawSize = enemy.size * 0.2;
            this.drawCircle(clawX, clawY, clawSize, [0.4, 0.4, 0.4, 1.0]);
        }
    }
    
    drawBrachiosaurus(enemy) {
        // Brachiosaurus body (light brown)
        this.drawCircle(enemy.x, enemy.y, enemy.size, [0.7, 0.6, 0.4, 1.0]);
        
        // Brachiosaurus neck (long)
        const neckSize = enemy.size * 0.6;
        this.drawCircle(enemy.x, enemy.y - enemy.size * 1.2, neckSize, [0.6, 0.5, 0.3, 1.0]);
        
        // Brachiosaurus head (small, on top of neck)
        const headSize = enemy.size * 0.8;
        this.drawCircle(enemy.x, enemy.y - enemy.size * 1.8, headSize, [0.5, 0.4, 0.2, 1.0]);
        
        // Brachiosaurus legs (four)
        const legSize = enemy.size * 0.4;
        this.drawCircle(enemy.x - enemy.size * 0.6, enemy.y + enemy.size * 0.6, legSize, [0.6, 0.5, 0.3, 1.0]); // Front left
        this.drawCircle(enemy.x + enemy.size * 0.6, enemy.y + enemy.size * 0.6, legSize, [0.6, 0.5, 0.3, 1.0]); // Front right
        this.drawCircle(enemy.x - enemy.size * 0.6, enemy.y - enemy.size * 0.6, legSize, [0.6, 0.5, 0.3, 1.0]); // Back left
        this.drawCircle(enemy.x + enemy.size * 0.6, enemy.y - enemy.size * 0.6, legSize, [0.6, 0.5, 0.3, 1.0]); // Back right
    }
    
    drawBullets() {
        this.bullets.forEach(bullet => {
            if (bullet.type === 'laserBeam') {
                // Draw laser beam with glow effect
                const beamLength = 8;
                const beamEndX = bullet.x - bullet.vx * beamLength / Math.sqrt(bullet.vx * bullet.vx + bullet.vy * bullet.vy);
                const beamEndY = bullet.y - bullet.vy * beamLength / Math.sqrt(bullet.vx * bullet.vx + bullet.vy * bullet.vy);
                
                // Multiple layers for glow effect
                for (let i = 0; i < 3; i++) {
                    const glowWidth = bullet.size + (i * 2);
                    const glowAlpha = 0.9 - (i * 0.3);
                    this.drawLaserBlade(
                        bullet.x, bullet.y,
                        beamEndX, beamEndY,
                        glowWidth,
                        [0.0, 1.0, 0.0, glowAlpha] // Green laser color
                    );
                }
            } else {
                // Fallback for regular bullets
                this.drawCircle(bullet.x, bullet.y, bullet.size, [1.0, 1.0, 0.0, 1.0]);
            }
        });
    }
    
    drawRect(x, y, width, height, color) {
        const vertices = [
            x, y,
            x + width, y,
            x, y + height,
            x + width, y + height
        ];
        
        const colors = [
            color[0], color[1], color[2], color[3],
            color[0], color[1], color[2], color[3],
            color[0], color[1], color[2], color[3],
            color[0], color[1], color[2], color[3]
        ];
        
        const vertexBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, vertexBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(vertices), this.gl.STATIC_DRAW);
        
        const colorBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, colorBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(colors), this.gl.STATIC_DRAW);
        
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, vertexBuffer);
        this.gl.enableVertexAttribArray(this.positionLocation);
        this.gl.vertexAttribPointer(this.positionLocation, 2, this.gl.FLOAT, false, 0, 0);
        
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, colorBuffer);
        this.gl.enableVertexAttribArray(this.colorLocation);
        this.gl.vertexAttribPointer(this.colorLocation, 4, this.gl.FLOAT, false, 0, 0);
        
        this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
    }
    
    drawLaserBlade(x1, y1, x2, y2, width, color) {
        // Calculate perpendicular vector for blade width
        const dx = x2 - x1;
        const dy = y2 - y1;
        const length = Math.sqrt(dx * dx + dy * dy);
        
        if (length === 0) return;
        
        const perpX = -dy / length * width / 2;
        const perpY = dx / length * width / 2;
        
        // Create blade rectangle
        const vertices = [
            x1 + perpX, y1 + perpY,
            x1 - perpX, y1 - perpY,
            x2 + perpX, y2 + perpY,
            x2 - perpX, y2 - perpY
        ];
        
        const colors = [
            color[0], color[1], color[2], color[3],
            color[0], color[1], color[2], color[3],
            color[0], color[1], color[2], color[3],
            color[0], color[1], color[2], color[3]
        ];
        
        const vertexBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, vertexBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(vertices), this.gl.STATIC_DRAW);
        
        const colorBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, colorBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(colors), this.gl.STATIC_DRAW);
        
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, vertexBuffer);
        this.gl.enableVertexAttribArray(this.positionLocation);
        this.gl.vertexAttribPointer(this.positionLocation, 2, this.gl.FLOAT, false, 0, 0);
        
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, colorBuffer);
        this.gl.enableVertexAttribArray(this.colorLocation);
        this.gl.vertexAttribPointer(this.colorLocation, 4, this.gl.FLOAT, false, 0, 0);
        
        this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
    }
    
    drawPauseOverlay() {
        // Semi-transparent overlay
        this.drawRect(0, 0, this.canvas.width, this.canvas.height, [0, 0, 0, 0.5]);
        
        // Pause text
        const textWidth = 200;
        const textHeight = 50;
        const textX = (this.canvas.width - textWidth) / 2;
        const textY = (this.canvas.height - textHeight) / 2;
        
        this.drawRect(textX, textY, textWidth, textHeight, [0, 0, 0, 0.8]);
        this.drawRect(textX + 5, textY + 5, textWidth - 10, textHeight - 10, [1, 1, 1, 0.9]);
    }
    
    updateUI() {
        document.getElementById('score').textContent = this.score;
        document.getElementById('enemies').textContent = this.enemies.length;
        document.getElementById('health').textContent = this.health;
        
        // Update game time
        const gameTime = Math.floor((Date.now() - this.gameStartTime) / 1000);
        document.getElementById('gameTime').textContent = gameTime;
        
        // Update difficulty display
        const difficultyNames = {
            'easy': 'Easy',
            'medium': 'Medium', 
            'hard': 'Hard'
        };
        document.getElementById('difficulty').textContent = difficultyNames[this.difficulty] || 'Medium';
    }
    
    endGame() {
        this.gameOver = true;
        document.getElementById('finalScore').textContent = this.score;
        document.getElementById('gameOver').style.display = 'block';
    }
    
    restartGame() {
        this.gameOver = false;
        this.score = 0;
        this.setDifficultySettings(); // Reset difficulty settings
        this.enemies = [];
        this.bullets = [];
        this.lastEnemySpawn = 0;
        this.gameStartTime = Date.now();
        this.player.x = 400;
        this.player.y = 300;
        document.getElementById('gameOver').style.display = 'none';
        this.gameLoop();
    }
    
    gameLoop() {
        if (this.gameOver) return;
        
        if (!this.paused) {
            // Update game state
            this.updatePlayer();
            this.spawnEnemy();
            this.updateEnemies();
            this.updateBullets();
        }
        
        this.updateUI();
        
        // Render
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);
        
        this.drawPlayer();
        this.drawEnemies();
        this.drawBullets();
        
        // Draw pause overlay
        if (this.paused) {
            this.drawPauseOverlay();
        }
        
        requestAnimationFrame(() => this.gameLoop());
    }
}

// Global restart function
function restartGame() {
    game.restartGame();
}

// Start the game
let game = new Game(); 