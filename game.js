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

// --- ADVANCED MAP SYSTEM ---

// 1. THE ARCHITECTURE (Room Designs)
// We store layouts by ID so we can reuse them (e.g., 'CORRIDOR_V' can appear 5 times)
const ROOM_TEMPLATES = {
    'START': [
        "WWWWWWWWWWWWWWWWWWWW",
        "W..................W",
        "W..................W",
        "W.P................W",
        "WWWW.......WWWW....W",
        "W..................W",
        "W......WW..........W",
        "W............WW....W",
        "W...WW.............W",
        "W..................W",
        "W..................W",
        "W..................W",
        "W..................W",
        "W...................", // Exit East
        "WWWWWWWWWWWWWWWWWWWW"
    ],
    'HALLWAY': [
        "WWWWWWWWWWWWWWWWWWWW",
        "W..................W",
        "W...WW.............W",
        "W.......WW.........W",
        "W...........WW.....W",
        "W...............WW.W",
        "W..................W",
        "W..................W",
        "W.WW...............W",
        "...................W", // Exit West
        "W.....WW...........W",
        "W..................W",
        "W.........WW.......W",
        "W...................", // Exit East
        "WWWWWWWWWWWWWWWWWWWW"
    ],
    'PIT': [
        "WWWWWWWWWWWWWWWWWWWW",
        "W..................W",
        "W...WWWWWWWWWWWW...W",
        "W...W..........W...W",
        "W...W..........W...W",
        "W...W..........W...W",
        "W...W..........W...W",
        "W...W..........W...W",
        "W...W..........W...W",
        "W..................W",
        "W..................W",
        "W..................W",
        "W...WW........WW...W",
        "...................W", // Exit West
        "WWWWWWWWWWWWWWWWWWWW"
    ]
};

// 2. THE WORLD MAP (The Grid)
// null = Void/Wall. String = Room Template ID.
// This 3x3 grid represents your entire dungeon.
const DUNGEON_GRID = [
    [null,      null,      null],
    ['START', 'HALLWAY', 'PIT'], // (0,1) -> (1,1) -> (2,1)
    [null,      null,      null]
];

// 3. STATE
let dungeonX = 0; // Starting Grid X
let dungeonY = 1; // Starting Grid Y (Middle row)
let isTransitioning = false;

function preload() {
    // No external assets - purely procedural
}

function create() {
    // 1. SETUP WORLD
    platforms = this.physics.add.staticGroup();
    
    // 2. SETUP PLAYER
    // Created off-screen initially, moved by loadLevel
    player = this.add.rectangle(-100, -100, 24, 24, COLORS.PLAYER);
    this.physics.add.existing(player);
    // IMPORTANT: Allow checking bounds manually later
    player.body.setCollideWorldBounds(true); 
    player.body.onWorldBounds = true; 
    player.body.setDragX(PHY.RUN_SPEED * 4);

    this.physics.add.collider(player, platforms);

    // 3. LOAD INITIAL ROOM
    this.hasSpawned = false; 
    loadDungeonRoom(this, dungeonX, dungeonY);

    // 4. SETUP INPUTS
    keys = this.input.keyboard.addKeys({
        up: Phaser.Input.Keyboard.KeyCodes.UP, w: Phaser.Input.Keyboard.KeyCodes.W,
        down: Phaser.Input.Keyboard.KeyCodes.DOWN, s: Phaser.Input.Keyboard.KeyCodes.S,
        left: Phaser.Input.Keyboard.KeyCodes.LEFT, a: Phaser.Input.Keyboard.KeyCodes.A,
        right: Phaser.Input.Keyboard.KeyCodes.RIGHT, d: Phaser.Input.Keyboard.KeyCodes.D,
        jump1: Phaser.Input.Keyboard.KeyCodes.Z, 
        jump2: Phaser.Input.Keyboard.KeyCodes.SPACE,
        jump3: Phaser.Input.Keyboard.KeyCodes.U,
        dash1: Phaser.Input.Keyboard.KeyCodes.X,
        dash2: Phaser.Input.Keyboard.KeyCodes.SHIFT,
        dash3: Phaser.Input.Keyboard.KeyCodes.I
    });

    // 5. GUI
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

    if (!isTransitioning) {
	let nextDX = dungeonX;
	let nextDY = dungeonY;
	let transitionDir = '';

        // Check Exits
        if (player.x > 800 - 16) { 
            nextDX++; transitionDir = 'right'; 
        } 
        else if (player.x < 16) { 
            nextDX--; transitionDir = 'left'; 
        }
        else if (player.y > 600 - 16) { 
            nextDY++; transitionDir = 'down'; 
        }
        else if (player.y < 16) { 
            nextDY--; transitionDir = 'up'; 
        }

        // Process Transition
        if (transitionDir !== '') {
            // Check if the target room exists in the grid
            if (
                nextDY >= 0 && nextDY < DUNGEON_GRID.length &&
                nextDX >= 0 && nextDX < DUNGEON_GRID[0].length &&
                DUNGEON_GRID[nextDY][nextDX] !== null
            ) {
            switchRoom(this, nextDX, nextDY, transitionDir);
            } else {
                // It's a wall/edge of map - push player back slightly
                if (transitionDir === 'right') player.x = 780;
                if (transitionDir === 'left') player.x = 20;
                if (transitionDir === 'down') player.y = 580;
                if (transitionDir === 'up') player.y = 20;
            }
        }
    }

    // --- STEP 6: ROOM TRANSITIONS ---
    if (!isTransitioning) {
        // Right Edge -> Go to Room 1
        if (player.x > 800 - 15) { 
            if (currentRoomIndex === 0) switchRoom(this, 1, 'right');
        } 
        // Left Edge -> Go back to Room 0
        else if (player.x < 15) { 
            if (currentRoomIndex === 1) switchRoom(this, 0, 'left');
        }
    }
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

function loadDungeonRoom(scene, dx, dy) {
    // 1. Validation
    if (dy < 0 || dy >= DUNGEON_GRID.length || dx < 0 || dx >= DUNGEON_GRID[0].length) {
        console.error("Out of bounds!");
        return;
    }
    
    const roomId = DUNGEON_GRID[dy][dx];
    if (!roomId) {
        console.error("Trying to load null room!"); 
        return;
    }

    const layout = ROOM_TEMPLATES[roomId];

    // 2. Clear & Build
    platforms.clear(true, true); 
    const TILE_SIZE = 40;

    for (let row = 0; row < layout.length; row++) {
        const line = layout[row];
        for (let col = 0; col < line.length; col++) {
            const char = line[col];
            const x = col * TILE_SIZE + (TILE_SIZE/2);
            const y = row * TILE_SIZE + (TILE_SIZE/2);

            if (char === 'W') {
                createPlatform(scene, x, y, TILE_SIZE, TILE_SIZE);
            }
            // Add Hazards/Enemies here later (e.g. if char === '^')
            
            // Only spawn at 'P' if it's the very first game load
            if (char === 'P' && !scene.hasSpawned) {
                player.setPosition(x, y);
                scene.hasSpawned = true;
            }
        }
    }
}

function switchRoom(scene, nextX, nextY, transitionDir) {
    if (nextY < 0 || nextY >= DUNGEON_GRID.length ||
        nextX < 0 || nextX >= DUNGEON_GRID[0].length ||
        !DUNGEON_GRID[nextY][nextX]) {
        return;
    }

    isTransitioning = true;
    scene.physics.pause();
    player.body.setVelocity(0, 0);
    const nextRoomId = DUNGEON_GRID[nextY][nextX];

    scene.cameras.main.fadeOut(200, 0, 0, 0);

    scene.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
        dungeonX = nextX;
        dungeonY = nextY;
        loadDungeonRoom(scene, dungeonX, dungeonY);

        // --- STRICT BORDER SPAWN LOGIC ---

        const TILE_SIZE = 40;

        // 1. Calculate Player's Current "Grid" position (to preserve alignment)
        let currentGridY = Math.floor(player.y / TILE_SIZE);
        let currentGridX = Math.floor(player.x / TILE_SIZE);

        // 2. Determine Target Border based on direction
        let targetGridX = currentGridX;
        let targetGridY = currentGridY;
        let scanAxis = '';

        if (transitionDir === 'right') {
            // Enter LEFT wall of new room (Column 0)
            targetGridX = 0;
            targetGridY = currentGridY; // Try to keep Y
            scanAxis = 'vertical';
        }
        else if (transitionDir === 'left') {
            // Enter RIGHT wall of new room (Column 19)
            targetGridX = 19;
            targetGridY = currentGridY; // Try to keep Y
            scanAxis = 'vertical';
        }
        else if (transitionDir === 'down') {
            // Enter TOP wall of new room (Row 0)
            targetGridX = currentGridX; // Try to keep X
            targetGridY = 0;
            scanAxis = 'horizontal';
        }
        else if (transitionDir === 'up') {
            // Enter BOTTOM wall of new room (Row 14)
            targetGridX = currentGridX; // Try to keep X
            targetGridY = 14;
            scanAxis = 'horizontal';
        }

        // 3. Find the opening strictly on that border
        const safePos = findSafeSpawn(nextRoomId, targetGridX, targetGridY, scanAxis);

        player.x = safePos.x;
        player.y = safePos.y;

        scene.cameras.main.fadeIn(200, 0, 0, 0);
        scene.physics.resume();
        isTransitioning = false;
    });
}

function findSafeSpawn(roomId, gridX, gridY, axis) {
    const layout = ROOM_TEMPLATES[roomId];
    const TILE_SIZE = 40;

    // Limits
    const MAX_ROW = 14; // 15 rows (0-14)
    const MAX_COL = 19; // 20 cols (0-19)

    // Helper to check if a tile is "Passable" (Not a wall)
    const isSafe = (r, c) => {
        if (r < 0 || r > MAX_ROW || c < 0 || c > MAX_COL) return false;
        return layout[r][c] !== 'W';
    };

    // 1. Define the specific line we must stay on
    // If scanning Vertical (entering Left/Right), we lock the Column (gridX) and search Rows.
    // If scanning Horizontal (entering Up/Down), we lock the Row (gridY) and search Cols.

    let bestRow = gridY;
    let bestCol = gridX;
    let found = false;

    // Search Radius (how far to slide to find a door)
    const MAX_SEARCH = 6;

    if (axis === 'vertical') {
        // We are locked to a specific Column (0 or 19). Find best Row.
        // Check center first, then spread out: 0, +1, -1, +2, -2...
        for (let i = 0; i <= MAX_SEARCH; i++) {
            // Check Down
            if (isSafe(gridY + i, gridX)) { bestRow = gridY + i; found = true; break; }
            // Check Up
            if (isSafe(gridY - i, gridX)) { bestRow = gridY - i; found = true; break; }
        }
    }
    else {
        // We are locked to a specific Row (0 or 14). Find best Column.
        for (let i = 0; i <= MAX_SEARCH; i++) {
            // Check Right
            if (isSafe(gridY, gridX + i)) { bestCol = gridX + i; found = true; break; }
            // Check Left
            if (isSafe(gridY, gridX - i)) { bestCol = gridX - i; found = true; break; }
        }
    }

    // Convert back to pixels
    // We add +20 (Half Tile) to center the player in the tile
    return {
        x: bestCol * TILE_SIZE + (TILE_SIZE / 2),
        y: bestRow * TILE_SIZE + (TILE_SIZE / 2)
    };
}
