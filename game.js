// CONFIGURAÇÃO GERAL
const config = {
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    backgroundColor: '#0a0a0a',
    pixelArt: true,
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { y: 2000 },
            debug: false
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
    JUMP_CUTOFF: -300,
    GRAVITY_FALL: 2000,
    GRAVITY_DASH: 0,
    DASH_SPEED: 800,
    DASH_DURATION: 150,
    DASH_COOLDOWN: 400,
    COYOTE_TIME: 100,
    JUMP_BUFFER: 150
};

const COLORS = {
    PLAYER: 0x00ffff,
    PLAYER_DASH: 0xff00ff,
    PLATFORM: 0x00ff00,
    PORTAL: 0xffaa00,
    TRAIL: 0x00ffff
};

const GRID = { W: 20, H: 15, SIZE: 40 };

// --- WORLD DATA ---
const WORLD = [
    [ // Room 0
        "####################",
        "#..................#",
        "#..................#",
        "#..................#",
        "#..................#",
        "#........####......#",
        "#........#..#......#",
        "#........#..#......#",
        "#........####......#",
        "#..................#",
        "#.................1#",
        "#..................#",
        "#..................#", // Portal 0
        "#0.............P...#",
        "####################"
    ],
    [ // Room 1
        "####################",
        "#..................#", // P = Default Spawn
        "#..................#",
        "#..................#",
        "#..................#",
        "#........##........#",
        "#.........#........#",
        "#.........#........#",
        "#........###.......#",
        "#..................#",
        "#..................#",
        "#.................1#",
        "#..................#", // Portal 0
        "#...P.............0#",
        "####################"
    ],
    [ // Room 2
        "####################",
        "#..................#", // P = Default Spawn
        "#..................#",
        "#..................#",
        "#..................#",
        "#......####........#",
        "#......#..#........#",
        "#........#.........#",
        "#......####........#",
        "#..................#",
        "#...P..............#",
        "#..................#",
        "#..................#", // Portal 0
        "#1................0#",
        "####################"
    ]

];

// ADJ[RoomID][PortalID] = TargetRoomID
const ADJ = [
    [1, 2], // Room 0: Portal 0 -> Goes to Room 1
    [0, 2], // Room 1: Portal 0 -> Goes to Room 0
    [0, 1]
];

// --- GLOBALS ---
let player;
let platforms;
let portals;
let keys;
let currentRoomIndex = 0;

// Player State
let pState = {
    fsm: 'IDLE', 
    coyoteTimer: 0,
    jumpBufferTimer: 0,
    canDash: true,
    dashTimer: 0,
    isDashing: false,
    // FIX: Lock Logic instead of Cooldown
    lockedPortalId: null, 
    isTouchingLocked: false,
    facing: { x: 1, y: 0 }
};

// Input State
let input = {
    x: 0, y: 0,
    jumpPressed: false,
    jumpHeld: false,
    dashPressed: false
};

let trailTimer = 0;

function preload() {}

function create() {
    platforms = this.physics.add.staticGroup();
    portals = this.physics.add.staticGroup(); 

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

    player = this.add.rectangle(0, 0, 24, 24, COLORS.PLAYER);
    this.physics.add.existing(player);
    player.body.setDragX(PHY.RUN_SPEED * 4);
    player.body.setCollideWorldBounds(false); 
    
    this.physics.add.collider(player, platforms);
    this.physics.add.overlap(player, portals, (p, portal) => {
        enterPortal(this, portal.portalIndex);
    });

    loadRoom(this, 0, null);

    this.debugText = this.add.text(10, 10, '', {
        fontFamily: 'monospace', fontSize: '12px', color: '#00ff00'
    });
}

function update(time, delta) {
    // 1. INPUT
    input.x = 0; input.y = 0;
    if (keys.left.isDown || keys.a.isDown) input.x = -1;
    if (keys.right.isDown || keys.d.isDown) input.x = 1;
    if (keys.up.isDown || keys.w.isDown) input.y = -1;
    if (keys.down.isDown || keys.s.isDown) input.y = 1;

    if (input.x !== 0 || input.y !== 0) {
        pState.facing.x = input.x; pState.facing.y = input.y;
    } else if (input.x === 0 && input.y === 0 && pState.facing.x === 0) {
        pState.facing.x = 1; 
    }

    const jumpJustPressed = Phaser.Input.Keyboard.JustDown(keys.jump1) || Phaser.Input.Keyboard.JustDown(keys.jump2) || Phaser.Input.Keyboard.JustDown(keys.jump3);
    input.jumpHeld = keys.jump1.isDown || keys.jump2.isDown || keys.jump3.isDown;
    const dashJustPressed = Phaser.Input.Keyboard.JustDown(keys.dash1) || Phaser.Input.Keyboard.JustDown(keys.dash2) || Phaser.Input.Keyboard.JustDown(keys.dash3);

    // 2. LOGIC UPDATES
    if (pState.jumpBufferTimer > 0) pState.jumpBufferTimer -= delta;
    if (jumpJustPressed) pState.jumpBufferTimer = PHY.JUMP_BUFFER;
    
    // FIX: Update Portal Lock
    // If the player has moved off the locked portal (isTouchingLocked is false from last frame), clear the lock.
    if (pState.lockedPortalId !== null && !pState.isTouchingLocked) {
        pState.lockedPortalId = null; 
    }
    // Reset for the upcoming physics step. If they are still overlapping, enterPortal will set this back to true.
    pState.isTouchingLocked = false; 

    const onFloor = player.body.touching.down;
    if (onFloor) {
        pState.coyoteTimer = PHY.COYOTE_TIME;
        pState.canDash = true;
        player.fillColor = COLORS.PLAYER;
    } else {
        if (pState.coyoteTimer > 0) pState.coyoteTimer -= delta;
    }

    // 3. DASH
    if (pState.isDashing) {
        pState.dashTimer -= delta;
        if (pState.dashTimer <= 0) {
            endDash();
        } else {
            trailTimer -= delta;
            if (trailTimer <= 0) {
                createTrail(this, player);
                trailTimer = 10;
            }
            return; 
        }
    }

    if (dashJustPressed && pState.canDash && !pState.isDashing) {
        startDash(input.x, input.y);
        return;
    }

    // 4. JUMP
    if (pState.jumpBufferTimer > 0 && pState.coyoteTimer > 0) executeJump();
    if (!input.jumpHeld && player.body.velocity.y < PHY.JUMP_CUTOFF) player.body.setVelocityY(PHY.JUMP_CUTOFF);

    // 5. MOVE
    if (input.x !== 0) player.body.setVelocityX(input.x * PHY.RUN_SPEED);
    else player.body.setVelocityX(0);

    // 6. OUT OF BOUNDS
    if (player.y > config.height) {
        loadRoom(this, 0, null);
    }

    this.debugText.setText(`ROOM: ${currentRoomIndex} | LOCKED: ${pState.lockedPortalId}`);
}

// --- CORE FUNCTIONS ---

function loadRoom(scene, roomIndex, targetPortalId) {
    if (!WORLD[roomIndex]) {
        console.error("Missing Room:", roomIndex);
        return;
    }

    currentRoomIndex = roomIndex;
    const mapData = WORLD[roomIndex];
    
    platforms.clear(true, true);
    portals.clear(true, true);
    
    // FIX: Set Lock
    // If we are arriving via a portal, lock it. If starting game (null), don't lock.
    pState.lockedPortalId = targetPortalId; 
    pState.isTouchingLocked = true; // Assume touching on spawn frame

    let spawnX = 100, spawnY = 100;
    
    for (let row = 0; row < GRID.H; row++) {
        let line = mapData[row];
        if (!line) continue;
        for (let col = 0; col < GRID.W; col++) {
            const char = line[col];
            const x = col * GRID.SIZE + (GRID.SIZE/2);
            const y = row * GRID.SIZE + (GRID.SIZE/2);

            if (char === '#') { 
                createPlatform(scene, x, y, GRID.SIZE, GRID.SIZE);
            } 
            else if (char === 'P') { 
                if (targetPortalId === null) {
                    spawnX = x; spawnY = y;
                }
            } 
            else if (char >= '0' && char <= '9') {
                const pIndex = parseInt(char);
                const p = scene.add.rectangle(x, y, GRID.SIZE, GRID.SIZE, COLORS.PORTAL);
                scene.physics.add.existing(p, true);
                p.portalIndex = pIndex;
                portals.add(p);

                if (targetPortalId === pIndex) {
                    spawnX = x; spawnY = y;
                }
            }
        }
    }

    player.body.reset(spawnX, spawnY - 4); 
}

function enterPortal(scene, portalIndex) {
    // FIX: Check Lock
    // If we are overlapping the portal we just arrived from, do not switch.
    if (portalIndex === pState.lockedPortalId) {
        pState.isTouchingLocked = true; // Mark as still touching
        return;
    }

    if (ADJ[currentRoomIndex] && ADJ[currentRoomIndex][portalIndex] !== undefined) {
        const targetRoom = ADJ[currentRoomIndex][portalIndex];
        scene.cameras.main.shake(100, 0.005);
        loadRoom(scene, targetRoom, portalIndex); 
    }
}

function createPlatform(scene, x, y, w, h) {
    const p = scene.add.rectangle(x, y, w, h, COLORS.PLATFORM);
    scene.physics.add.existing(p, true);
    platforms.add(p);
}

function executeJump() {
    player.body.setVelocityY(PHY.JUMP_FORCE);
    pState.jumpBufferTimer = 0; pState.coyoteTimer = 0;
    player.scaleY = 1.4; player.scaleX = 0.6;
    game.scene.scenes[0].tweens.add({ targets: player, scaleX: 1, scaleY: 1, duration: 150 });
}

function startDash(dirX, dirY) {
    pState.isDashing = true; pState.canDash = false; pState.dashTimer = PHY.DASH_DURATION;
    let speedX = dirX; let speedY = dirY;
    if (dirX === 0 && dirY === 0) { speedX = pState.facing.x; speedY = pState.facing.y; }
    if (speedX !== 0 && speedY !== 0) { speedX *= 0.707; speedY *= 0.707; }
    player.body.setAllowGravity(false);
    player.body.setVelocity(speedX * PHY.DASH_SPEED, speedY * PHY.DASH_SPEED);
    player.fillColor = COLORS.PLAYER_DASH;
    game.scene.scenes[0].cameras.main.shake(100, 0.01);
}

function endDash() {
    pState.isDashing = false;
    player.body.setAllowGravity(true);
    player.body.setVelocity(player.body.velocity.x * 0.5, player.body.velocity.y * 0.5);
    player.fillColor = COLORS.PLAYER;
}

function createTrail(scene, target) {
    const trail = scene.add.rectangle(target.x, target.y, target.width, target.height, COLORS.TRAIL);
    trail.alpha = 0.6;
    scene.tweens.add({ targets: trail, alpha: 0, scale: 0.15, duration: 100, onComplete: () => trail.destroy() });
}
