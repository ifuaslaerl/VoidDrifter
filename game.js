// CONFIGURAÇÃO GERAL
const config = {
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    backgroundColor: '#000000',
    pixelArt: true,
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { y: 2500 }, // Gravidade alta para pulos rápidos
            debug: true
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

let input = {
    up: false, down: false, left: false, right: false, jump: false, dash: false
};

let player;
let platforms;
let isJumping = false;

// TUNING (Física "Snappy")
const PHY = {
    RUN_SPEED: 350,
    JUMP_FORCE: -900,
    JUMP_CUTOFF: -400
};

function preload() { }

function create() {
    // AMBIENTE
    platforms = this.physics.add.staticGroup();
    platforms.add(this.add.rectangle(400, 580, 800, 40, 0x00ff00));
    platforms.add(this.add.rectangle(600, 400, 200, 20, 0x00ff00));

    // PLAYER (Revertido para Quadrado 32x32)
    player = this.add.rectangle(100, 450, 32, 32, 0x00ffff);
    this.physics.add.existing(player);
    player.body.setCollideWorldBounds(true);
    
    // Limite de velocidade vertical apenas
    player.body.setMaxVelocity(10000, 2000);

    this.physics.add.collider(player, platforms);

    // DEBUG UI (Simples)
    this.debugText = this.add.text(20, 20, '', {
        fontFamily: 'monospace', fontSize: '16px', color: '#00ff00'
    });

    // INPUTS
    this.keys = this.input.keyboard.addKeys({
        up: Phaser.Input.Keyboard.KeyCodes.UP, w: Phaser.Input.Keyboard.KeyCodes.W,
        down: Phaser.Input.Keyboard.KeyCodes.DOWN, s: Phaser.Input.Keyboard.KeyCodes.S,
        left: Phaser.Input.Keyboard.KeyCodes.LEFT, a: Phaser.Input.Keyboard.KeyCodes.A,
        right: Phaser.Input.Keyboard.KeyCodes.RIGHT, d: Phaser.Input.Keyboard.KeyCodes.D,
        jump_z: Phaser.Input.Keyboard.KeyCodes.Z, jump_space: Phaser.Input.Keyboard.KeyCodes.SPACE,
        arcade_u: Phaser.Input.Keyboard.KeyCodes.U, arcade_j: Phaser.Input.Keyboard.KeyCodes.J,
        dash_x: Phaser.Input.Keyboard.KeyCodes.X, dash_shift: Phaser.Input.Keyboard.KeyCodes.SHIFT,
        arcade_i: Phaser.Input.Keyboard.KeyCodes.I, arcade_k: Phaser.Input.Keyboard.KeyCodes.K
    });
}

function update() {
    // 1. Polling
    input.left = this.keys.left.isDown || this.keys.a.isDown;
    input.right = this.keys.right.isDown || this.keys.d.isDown;
    input.jump = this.keys.jump_z.isDown || this.keys.jump_space.isDown || this.keys.arcade_u.isDown || this.keys.arcade_j.isDown;

    // 2. Movimentação Horizontal (Instantânea)
    if (input.left) {
        player.body.setVelocityX(-PHY.RUN_SPEED);
    } else if (input.right) {
        player.body.setVelocityX(PHY.RUN_SPEED);
    } else {
        player.body.setVelocityX(0);
    }

    // 3. Pulo Variável
    if (input.jump && player.body.touching.down) {
        player.body.setVelocityY(PHY.JUMP_FORCE);
        isJumping = true;
    }

    if (!input.jump && isJumping) {
        if (player.body.velocity.y < PHY.JUMP_CUTOFF) {
            player.body.setVelocityY(PHY.JUMP_CUTOFF);
        }
        isJumping = false;
    }

    if (player.body.touching.down) {
        isJumping = false;
    }

    // 4. Debug Info Simplificado
    this.debugText.setText(
        `POS: ${Math.round(player.x)}, ${Math.round(player.y)}\n` +
        `VEL: ${Math.round(player.body.velocity.x)}, ${Math.round(player.body.velocity.y)}`
    );
}
