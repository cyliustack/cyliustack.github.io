// 3D WebGL Game - Warriors Hunter
class Game3D {
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
        this.enemySpawnRate = 2000; // ms
        this.maxEnemies = 20; // Maximum enemies on screen
        this.gameStartTime = Date.now();
        
        // 3D Camera
        this.camera = {
            x: 0, y: 1.7, z: 0, // Player height
            rotX: 0, rotY: 0, // Mouse look
            fov: 75,
            near: 0.1,
            far: 1000
        };
        
        // Player movement
        this.player = {
            x: 0, y: 1.7, z: 0,
            speed: 0.1,
            weapon: {
                damage: 25,
                fireRate: 300,
                lastShot: 0,
                ammo: 30,
                maxAmmo: 30,
                type: 'laserSword'
            }
        };
        
        // Controls
        this.keys = {};
        this.mouse = { x: 0, y: 0 };
        this.mouseSensitivity = 0.002;
        this.pointerLocked = false;
        
        // Sound effects
        this.sounds = {};
        this.initSounds();
        
        this.initWebGL();
        this.setupEventListeners();
        this.gameLoop();
    }
    
    initSounds() {
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
        this.playSound(800, 0.1, 'sawtooth');
        setTimeout(() => this.playSound(600, 0.1, 'sawtooth'), 50);
    }
    
    playShootSound() {
        this.playSound(400, 0.2, 'square');
    }
    
    playEnemyDeathSound() {
        this.playSound(200, 0.3, 'triangle');
    }
    
    initWebGL() {
        this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        this.gl.clearColor(0.4, 0.8, 0.4, 1.0); // Light natural green background
        this.gl.enable(this.gl.DEPTH_TEST);
        this.gl.enable(this.gl.CULL_FACE);
        
        // Create shaders for 3D
        const vertexShaderSource = `
            attribute vec3 a_position;
            attribute vec3 a_normal;
            attribute vec4 a_color;
            uniform mat4 u_modelViewMatrix;
            uniform mat4 u_projectionMatrix;
            uniform mat4 u_normalMatrix;
            varying vec4 v_color;
            varying vec3 v_normal;
            varying vec3 v_position;
            
            void main() {
                v_position = vec3(u_modelViewMatrix * vec4(a_position, 1.0));
                v_normal = vec3(u_normalMatrix * vec4(a_normal, 0.0));
                v_color = a_color;
                gl_Position = u_projectionMatrix * u_modelViewMatrix * vec4(a_position, 1.0);
            }
        `;
        
        const fragmentShaderSource = `
            precision mediump float;
            varying vec4 v_color;
            varying vec3 v_normal;
            varying vec3 v_position;
            uniform vec3 u_lightPosition;
            
            void main() {
                vec3 normal = normalize(v_normal);
                vec3 lightDir = normalize(u_lightPosition - v_position);
                float diff = max(dot(normal, lightDir), 0.0);
                vec3 diffuse = diff * vec3(1.0, 1.0, 1.0);
                vec3 ambient = vec3(0.3, 0.3, 0.3);
                vec3 finalColor = (ambient + diffuse) * v_color.rgb;
                gl_FragColor = vec4(finalColor, v_color.a);
            }
        `;
        
        this.program = this.createProgram(vertexShaderSource, fragmentShaderSource);
        this.gl.useProgram(this.program);
        
        // Get attribute and uniform locations
        this.positionLocation = this.gl.getAttribLocation(this.program, 'a_position');
        this.normalLocation = this.gl.getAttribLocation(this.program, 'a_normal');
        this.colorLocation = this.gl.getAttribLocation(this.program, 'a_color');
        this.modelViewMatrixLocation = this.gl.getUniformLocation(this.program, 'u_modelViewMatrix');
        this.projectionMatrixLocation = this.gl.getUniformLocation(this.program, 'u_projectionMatrix');
        this.normalMatrixLocation = this.gl.getUniformLocation(this.program, 'u_normalMatrix');
        this.lightPositionLocation = this.gl.getUniformLocation(this.program, 'u_lightPosition');
        
        // Set up matrices
        this.projectionMatrix = this.createPerspectiveMatrix();
        this.gl.uniformMatrix4fv(this.projectionMatrixLocation, false, this.projectionMatrix);
        this.gl.uniform3f(this.lightPositionLocation, 0, 10, 0);
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
    
    createPerspectiveMatrix() {
        const fov = this.camera.fov * Math.PI / 180;
        const aspect = this.canvas.width / this.canvas.height;
        const near = this.camera.near;
        const far = this.camera.far;
        
        const f = 1.0 / Math.tan(fov / 2);
        const rangeInv = 1 / (near - far);
        
        return [
            f / aspect, 0, 0, 0,
            0, f, 0, 0,
            0, 0, (near + far) * rangeInv, near * far * rangeInv,
            0, 0, -1, 0
        ];
    }
    
    createRotationMatrix(rotX, rotY) {
        const cosX = Math.cos(rotX);
        const sinX = Math.sin(rotX);
        const cosY = Math.cos(rotY);
        const sinY = Math.sin(rotY);
        
        return [
            cosY, 0, sinY, 0,
            sinX * sinY, cosX, -sinX * cosY, 0,
            -cosX * sinY, sinX, cosX * cosY, 0,
            0, 0, 0, 1
        ];
    }
    
    createTranslationMatrix(x, y, z) {
        return [
            1, 0, 0, 0,
            0, 1, 0, 0,
            0, 0, 1, 0,
            x, y, z, 1
        ];
    }
    
    multiplyMatrices(a, b) {
        const result = new Array(16);
        for (let i = 0; i < 4; i++) {
            for (let j = 0; j < 4; j++) {
                result[i * 4 + j] = 0;
                for (let k = 0; k < 4; k++) {
                    result[i * 4 + j] += a[i * 4 + k] * b[k * 4 + j];
                }
            }
        }
        return result;
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
        this.canvas.addEventListener('click', (e) => {
            e.preventDefault();
            this.canvas.requestPointerLock();
        });
        
        document.addEventListener('pointerlockchange', () => {
            this.pointerLocked = document.pointerLockElement === this.canvas;
        });
        
        document.addEventListener('mousemove', (e) => {
            if (this.pointerLocked) {
                this.camera.rotY -= e.movementX * this.mouseSensitivity;
                this.camera.rotX -= e.movementY * this.mouseSensitivity;
                
                // Clamp vertical rotation
                this.camera.rotX = Math.max(-Math.PI/2, Math.min(Math.PI/2, this.camera.rotX));
            }
        });
        
        this.canvas.addEventListener('click', (e) => {
            e.preventDefault();
            if (!this.paused && !this.gameOver) {
                this.shoot();
            }
        });
    }
    
    updatePlayer() {
        // Calculate movement direction based on camera rotation
        const moveX = (this.keys['d'] ? 1 : 0) - (this.keys['a'] ? 1 : 0);
        const moveZ = (this.keys['s'] ? 1 : 0) - (this.keys['w'] ? 1 : 0);
        
        if (moveX !== 0 || moveZ !== 0) {
            const angle = this.camera.rotY;
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            
            this.player.x += (moveX * cos - moveZ * sin) * this.player.speed;
            this.player.z += (moveX * sin + moveZ * cos) * this.player.speed;
            
            // Update camera position
            this.camera.x = this.player.x;
            this.camera.z = this.player.z;
        }
    }
    
    shoot() {
        const now = Date.now();
        if (now - this.player.weapon.lastShot < this.player.weapon.fireRate || this.player.weapon.ammo <= 0) {
            return;
        }
        
        this.player.weapon.lastShot = now;
        this.player.weapon.ammo--;
        
        this.playShootSound();
        
        // Calculate bullet direction from camera rotation
        const bulletSpeed = 0.5;
        const bullet = {
            x: this.player.x,
            y: this.player.y,
            z: this.player.z,
            vx: Math.sin(this.camera.rotY) * Math.cos(this.camera.rotX) * bulletSpeed,
            vy: -Math.sin(this.camera.rotX) * bulletSpeed,
            vz: Math.cos(this.camera.rotY) * Math.cos(this.camera.rotX) * bulletSpeed,
            size: 0.1,
            life: 60,
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
        if (now - this.lastEnemySpawn < this.enemySpawnRate) return;
        
        this.lastEnemySpawn = now;
        
        if (this.enemies.length >= this.maxEnemies) return;
        
        // Spawn enemy at random position around player
        const angle = Math.random() * Math.PI * 2;
        const distance = 20 + Math.random() * 30;
        const x = this.player.x + Math.cos(angle) * distance;
        const z = this.player.z + Math.sin(angle) * distance;
        
        const enemy = {
            x: x,
            y: 1.0,
            z: z,
            size: 0.5 + Math.random() * 0.5,
            speed: 0.02 + Math.random() * 0.03,
            health: 30 + Math.random() * 20,
            maxHealth: 30 + Math.random() * 20,
            type: 'warrior'
        };
        
        this.enemies.push(enemy);
    }
    
    updateEnemies() {
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const enemy = this.enemies[i];
            
            // Move towards player
            const dx = this.player.x - enemy.x;
            const dz = this.player.z - enemy.z;
            const distance = Math.sqrt(dx * dx + dz * dz);
            
            if (distance > 0) {
                enemy.x += (dx / distance) * enemy.speed;
                enemy.z += (dz / distance) * enemy.speed;
            }
            
            // Check collision with player
            const playerDistance = Math.sqrt(
                (enemy.x - this.player.x) ** 2 + (enemy.z - this.player.z) ** 2
            );
            
            if (playerDistance < enemy.size + 0.5) {
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
            bullet.z += bullet.vz;
            bullet.life--;
            
            // Remove bullets that are too far or expired
            const bulletDistance = Math.sqrt(bullet.x ** 2 + bullet.y ** 2 + bullet.z ** 2);
            if (bullet.life <= 0 || bulletDistance > 100) {
                this.bullets.splice(i, 1);
                continue;
            }
            
            // Check collision with enemies
            for (let j = this.enemies.length - 1; j >= 0; j--) {
                const enemy = this.enemies[j];
                const distance = Math.sqrt(
                    (bullet.x - enemy.x) ** 2 + (bullet.y - enemy.y) ** 2 + (bullet.z - enemy.z) ** 2
                );
                
                if (distance < enemy.size + bullet.size) {
                    enemy.health -= this.player.weapon.damage;
                    
                    this.playHitSound();
                    
                    if (enemy.health <= 0) {
                        this.enemies.splice(j, 1);
                        this.score += 100;
                        this.playEnemyDeathSound();
                    }
                    
                    this.bullets.splice(i, 1);
                    break;
                }
            }
        }
    }
    
    createCube(size = 1.0, color = [1.0, 1.0, 1.0, 1.0]) {
        const s = size / 2;
        const vertices = [
            // Front face
            -s, -s,  s,  s, -s,  s,  s,  s,  s, -s,  s,  s,
            // Back face
            -s, -s, -s, -s,  s, -s,  s,  s, -s,  s, -s, -s,
            // Top face
            -s,  s, -s, -s,  s,  s,  s,  s,  s,  s,  s, -s,
            // Bottom face
            -s, -s, -s,  s, -s, -s,  s, -s,  s, -s, -s,  s,
            // Right face
             s, -s, -s,  s,  s, -s,  s,  s,  s,  s, -s,  s,
            // Left face
            -s, -s, -s, -s, -s,  s, -s,  s,  s, -s,  s, -s,
        ];
        
        const normals = [
            // Front
            0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1,
            // Back
            0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1,
            // Top
            0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0,
            // Bottom
            0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0,
            // Right
            1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0,
            // Left
            -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0,
        ];
        
        const colors = [];
        for (let i = 0; i < 24; i++) {
            colors.push(...color);
        }
        
        return { vertices, normals, colors };
    }
    
    drawCube(x, y, z, size, color) {
        const cube = this.createCube(size, color);
        
        // Create model-view matrix
        const translationMatrix = this.createTranslationMatrix(x, y, z);
        const rotationMatrix = this.createRotationMatrix(0, 0);
        const modelViewMatrix = this.multiplyMatrices(translationMatrix, rotationMatrix);
        
        this.gl.uniformMatrix4fv(this.modelViewMatrixLocation, false, modelViewMatrix);
        this.gl.uniformMatrix4fv(this.normalMatrixLocation, false, modelViewMatrix);
        
        // Create buffers
        const vertexBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, vertexBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(cube.vertices), this.gl.STATIC_DRAW);
        
        const normalBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, normalBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(cube.normals), this.gl.STATIC_DRAW);
        
        const colorBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, colorBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(cube.colors), this.gl.STATIC_DRAW);
        
        // Set up attributes
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, vertexBuffer);
        this.gl.enableVertexAttribArray(this.positionLocation);
        this.gl.vertexAttribPointer(this.positionLocation, 3, this.gl.FLOAT, false, 0, 0);
        
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, normalBuffer);
        this.gl.enableVertexAttribArray(this.normalLocation);
        this.gl.vertexAttribPointer(this.normalLocation, 3, this.gl.FLOAT, false, 0, 0);
        
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, colorBuffer);
        this.gl.enableVertexAttribArray(this.colorLocation);
        this.gl.vertexAttribPointer(this.colorLocation, 4, this.gl.FLOAT, false, 0, 0);
        
        // Draw
        this.gl.drawArrays(this.gl.TRIANGLE_FAN, 0, 4);
        this.gl.drawArrays(this.gl.TRIANGLE_FAN, 4, 4);
        this.gl.drawArrays(this.gl.TRIANGLE_FAN, 8, 4);
        this.gl.drawArrays(this.gl.TRIANGLE_FAN, 12, 4);
        this.gl.drawArrays(this.gl.TRIANGLE_FAN, 16, 4);
        this.gl.drawArrays(this.gl.TRIANGLE_FAN, 20, 4);
    }
    
    drawEnemies() {
        this.enemies.forEach(enemy => {
            // Warrior body (black cube)
            this.drawCube(enemy.x, enemy.y, enemy.z, enemy.size, [0.1, 0.1, 0.1, 1.0]);
            
            // Warrior helmet/ears (smaller black cubes)
            this.drawCube(enemy.x - enemy.size * 0.7, enemy.y + enemy.size * 0.3, enemy.z, enemy.size * 0.4, [0.1, 0.1, 0.1, 1.0]);
            this.drawCube(enemy.x + enemy.size * 0.7, enemy.y + enemy.size * 0.3, enemy.z, enemy.size * 0.4, [0.1, 0.1, 0.1, 1.0]);
        });
    }
    
    drawBullets() {
        this.bullets.forEach(bullet => {
            this.drawCube(bullet.x, bullet.y, bullet.z, bullet.size, [0.0, 1.0, 0.0, 1.0]);
        });
    }
    
    drawGround() {
        // Draw a simple ground plane
        for (let x = -50; x <= 50; x += 5) {
            for (let z = -50; z <= 50; z += 5) {
                const color = (x + z) % 10 === 0 ? [0.3, 0.3, 0.3, 1.0] : [0.2, 0.2, 0.2, 1.0];
                this.drawCube(x, -1, z, 0.1, color);
            }
        }
    }
    
    updateUI() {
        document.getElementById('score').textContent = this.score;
        document.getElementById('enemies').textContent = this.enemies.length;
        document.getElementById('health').textContent = this.health;
        
        const gameTime = Math.floor((Date.now() - this.gameStartTime) / 1000);
        document.getElementById('gameTime').textContent = gameTime;
    }
    
    drawPauseOverlay() {
        // For 3D, we'll use a simple overlay approach
        // In a full implementation, you might want to render this as a 3D overlay
        // For now, we'll just show the pause state in the UI
    }
    
    endGame() {
        this.gameOver = true;
        document.getElementById('finalScore').textContent = this.score;
        document.getElementById('gameOver').style.display = 'block';
        document.exitPointerLock();
    }
    
    restartGame() {
        this.gameOver = false;
        this.score = 0;
        this.health = 100;
        this.enemies = [];
        this.bullets = [];
        this.lastEnemySpawn = 0;
        this.gameStartTime = Date.now();
        this.player.x = 0;
        this.player.z = 0;
        this.camera.x = 0;
        this.camera.z = 0;
        this.camera.rotX = 0;
        this.camera.rotY = 0;
        this.player.weapon.ammo = this.player.weapon.maxAmmo;
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
        this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);
        
        // Create view matrix from camera
        const viewMatrix = this.multiplyMatrices(
            this.createTranslationMatrix(-this.camera.x, -this.camera.y, -this.camera.z),
            this.createRotationMatrix(this.camera.rotX, this.camera.rotY)
        );
        
        this.gl.uniformMatrix4fv(this.modelViewMatrixLocation, false, viewMatrix);
        this.gl.uniformMatrix4fv(this.normalMatrixLocation, false, viewMatrix);
        
        // Draw scene
        this.drawGround();
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
let game = new Game3D(); 