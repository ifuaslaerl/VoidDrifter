// CONFIGURAÇÃO GERAL
const config = {
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    backgroundColor: '#0a0a0a', // Darker background for Neon contrast
    pixelArt: true,
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { y: 2000 },
            debug: false // Turn off for gameplay feel, enable if needed
        }
    },
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH
    },
    scene: {
        preload: preload,
        create: create,
        update: update
    }
};

const game = new Phaser.Game(config);

// --- CONSTANTS ---
const PHY = {
    RUN_SPEED: 300,
    JUMP_FORCE: -750,
    JUMP_CUTOFF: -300,    // Velocity y when jump button is released
    GRAVITY_FALL: 2000,   // Standard gravity
    GRAVITY_DASH: 0,      // No gravity during dash
    DASH_SPEED: 800,
    DASH_DURATION: 150,   // ms
    DASH_COOLDOWN: 400,   // ms
    COYOTE_TIME: 100,     // ms
    JUMP_BUFFER: 150      // ms
};

const COLORS = {
    PLAYER: 0x00ffff,
    PLAYER_DASH: 0xff00ff,
    PLATFORM: 0x00ff00,
    TRAIL: 0x00ffff
};

// --- GLOBALS ---
let player;
let platforms;
let cursors;
let keys;

// Player State
let pState = {
    fsm: 'IDLE', // IDLE, RUN, JUMP, FALL, DASH
    coyoteTimer: 0,
    jumpBufferTimer: 0,
    canDash: true,
    dashTimer: 0,
    isDashing: false,
    facing: { x: 1, y: 0 } // Default facing right
};

// Input State
let input = {
    x: 0, y: 0,
    jumpPressed: false,
    jumpHeld: false,
    dashPressed: false
};

// Effects
let trailTimer = 0;

function preload() {
    // No external assets - purely procedural
}

function create() {
    // 1. SETUP WORLD
    platforms = this.physics.add.staticGroup();
    
    // Create a "Playground" level
    createPlatform(this, 400, 580, 800, 40); // Floor
    createPlatform(this, 200, 450, 200, 20); // Low Left
    createPlatform(this, 600, 350, 200, 20); // Mid Right
    createPlatform(this, 100, 250, 100, 20); // High Left
    createPlatform(this, 400, 150, 100, 20); // Top Center

    // 2. SETUP PLAYER
    player = this.add.rectangle(400, 500, 24, 24, COLORS.PLAYER);
    this.physics.add.existing(player);
    player.body.setCollideWorldBounds(true);
    player.body.setDragX(PHY.RUN_SPEED * 4); // Snappy stop

    this.physics.add.collider(player, platforms);

    // 3. SETUP INPUTS
    // Map multiple keys to abstract actions
    keys = this.input.keyboard.addKeys({
        up: Phaser.Input.Keyboard.KeyCodes.UP, w: Phaser.Input.Keyboard.KeyCodes.W,
        down: Phaser.Input.Keyboard.KeyCodes.DOWN, s: Phaser.Input.Keyboard.KeyCodes.S,
        left: Phaser.Input.Keyboard.KeyCodes.LEFT, a: Phaser.Input.Keyboard.KeyCodes.A,
        right: Phaser.Input.Keyboard.KeyCodes.RIGHT, d: Phaser.Input.Keyboard.KeyCodes.D,
        
        // Jump: Z, Space, Arcade Buttons (U/J)
        jump1: Phaser.Input.Keyboard.KeyCodes.Z, 
        jump2: Phaser.Input.Keyboard.KeyCodes.SPACE,
        jump3: Phaser.Input.Keyboard.KeyCodes.U,
        
        // Dash: X, Shift, Arcade Buttons (I/K)
        dash1: Phaser.Input.Keyboard.KeyCodes.X,
        dash2: Phaser.Input.Keyboard.KeyCodes.SHIFT,
        dash3: Phaser.Input.Keyboard.KeyCodes.I
    });

    // 4. GUI
    this.debugText = this.add.text(10, 10, '', {
        fontFamily: 'monospace', fontSize: '12px', color: '#00ff00'
    });
}

function update(time, delta) {
    // --- STEP 1: READ INPUTS ---
    input.x = 0;
    input.y = 0;
    
    if (keys.left.isDown || keys.a.isDown) input.x = -1;
    if (keys.right.isDown || keys.d.isDown) input.x = 1;
    if (keys.up.isDown || keys.w.isDown) input.y = -1;
    if (keys.down.isDown || keys.s.isDown) input.y = 1;

    // Update facing direction if moving (for dashing)
    if (input.x !== 0 || input.y !== 0) {
        pState.facing.x = input.x;
        pState.facing.y = input.y;
    } else if (input.x === 0 && input.y === 0) {
        // If neutral, dash forward based on last horizontal facing
        if (pState.facing.x === 0) pState.facing.x = 1; 
    }

    const jumpJustPressed = Phaser.Input.Keyboard.JustDown(keys.jump1) || 
                          Phaser.Input.Keyboard.JustDown(keys.jump2) ||
                          Phaser.Input.Keyboard.JustDown(keys.jump3);
                          
    input.jumpHeld = keys.jump1.isDown || keys.jump2.isDown || keys.jump3.isDown;

    const dashJustPressed = Phaser.Input.Keyboard.JustDown(keys.dash1) ||
                          Phaser.Input.Keyboard.JustDown(keys.dash2) ||
                          Phaser.Input.Keyboard.JustDown(keys.dash3);

    // --- STEP 2: LOGIC UPDATES ---
    
    // Jump Buffer Logic
    if (pState.jumpBufferTimer > 0) pState.jumpBufferTimer -= delta;
    if (jumpJustPressed) pState.jumpBufferTimer = PHY.JUMP_BUFFER;

    // Coyote Time Logic
    const onFloor = player.body.touching.down;
    if (onFloor) {
        pState.coyoteTimer = PHY.COYOTE_TIME;
        pState.canDash = true; // Reset dash on ground
        player.fillColor = COLORS.PLAYER; // Reset color
    } else {
        if (pState.coyoteTimer > 0) pState.coyoteTimer -= delta;
    }

    // --- STEP 3: STATE MACHINE ---
    
    // DASH STATE
    if (pState.isDashing) {
        pState.dashTimer -= delta;
        if (pState.dashTimer <= 0) {
            endDash();
        } else {
            // Visual Trail
            trailTimer -= delta;
            if (trailTimer <= 0) {
                createTrail(this, player);
                trailTimer = 10;
            }
            return; // Skip normal movement while dashing
        }
    }

    // TRIGGER DASH
    if (dashJustPressed && pState.canDash && !pState.isDashing) {
        startDash(input.x, input.y);
        return;
    }

    // JUMP LOGIC (Variable Height + Buffer + Coyote)
    if (pState.jumpBufferTimer > 0 && pState.coyoteTimer > 0) {
        executeJump();
    }

    // Variable Jump Height (Cutoff)
    if (!input.jumpHeld && player.body.velocity.y < PHY.JUMP_CUTOFF) {
        player.body.setVelocityY(PHY.JUMP_CUTOFF);
    }

    // --- STEP 4: MOVEMENT ---
    
    // Horizontal Move
    if (input.x !== 0) {
        player.body.setVelocityX(input.x * PHY.RUN_SPEED);
    } else {
        player.body.setVelocityX(0); // Friction handles smoothing via setDragX
    }

    // --- STEP 5: DEBUG ---
    this.debugText.setText(
        `STATE: ${pState.isDashing ? 'DASH' : (onFloor ? 'GROUND' : 'AIR')}\n` +
        `VEL: ${Math.round(player.body.velocity.x)}, ${Math.round(player.body.velocity.y)}\n` +
        `COYOTE: ${Math.round(pState.coyoteTimer)}\n` +
        `BUFFER: ${Math.round(pState.jumpBufferTimer)}`
    );
}

// --- HELPERS ---

function createPlatform(scene, x, y, w, h) {
    const p = scene.add.rectangle(x, y, w, h, COLORS.PLATFORM);
    scene.physics.add.existing(p, true); // true = static
    platforms.add(p);
}

function executeJump() {
    player.body.setVelocityY(PHY.JUMP_FORCE);
    pState.jumpBufferTimer = 0;
    pState.coyoteTimer = 0;
    
    // Squash & Stretch effect
    player.scaleY = 1.4;
    player.scaleX = 0.6;
    game.scene.scenes[0].tweens.add({
        targets: player,
        scaleX: 1,
        scaleY: 1,
        duration: 150,
        ease: 'Power1'
    });
}

function startDash(dirX, dirY) {
    pState.isDashing = true;
    pState.canDash = false;
    pState.dashTimer = PHY.DASH_DURATION;
    
    // Normalize diagonal dash speed
    let speedX = dirX;
    let speedY = dirY;
    
    // If no direction, dash towards facing
    if (dirX === 0 && dirY === 0) {
        speedX = pState.facing.x;
        speedY = pState.facing.y;
    }

    // Normalize vector for diagonals
    if (speedX !== 0 && speedY !== 0) {
        const factor = 0.707; // 1 / sqrt(2)
        speedX *= factor;
        speedY *= factor;
    }

    player.body.setAllowGravity(false);
    player.body.setVelocity(speedX * PHY.DASH_SPEED, speedY * PHY.DASH_SPEED);
    player.fillColor = COLORS.PLAYER_DASH;

    // Small screen shake
    game.scene.scenes[0].cameras.main.shake(100, 0.01);
}

function endDash() {
    pState.isDashing = false;
    player.body.setAllowGravity(true);
    player.body.setVelocity(player.body.velocity.x * 0.5, player.body.velocity.y * 0.5); // Drag after dash
    player.fillColor = COLORS.PLAYER;
}

function createTrail(scene, target) {
    const trail = scene.add.rectangle(target.x, target.y, target.width, target.height, COLORS.TRAIL);
    trail.alpha = 0.6;
    scene.tweens.add({
        targets: trail,
        alpha: 0,
        scale: 0.15,
        duration: 100,
        onComplete: () => trail.destroy()
    });
}
