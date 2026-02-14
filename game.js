// CONFIGURAÇÃO GERAL
const config = {
    type: Phaser.AUTO,
    width: 800,      // Resolução ajustada
    height: 600,     // Resolução ajustada
    backgroundColor: '#000000', // Fundo Preto Puro
    pixelArt: true,  // Mantém renderização nítida
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { y: 0 }, // Sem gravidade por enquanto
            debug: true        // Debug visual ativado
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

// INICIALIZAÇÃO DO JOGO
const game = new Phaser.Game(config);

// ESTADO GLOBAL DE INPUT
let input = {
    up: false,
    down: false,
    left: false,
    right: false,
    jump: false,
    dash: false
};

function preload() {
    // Fase 1: Sem assets externos
}

function create() {
    // 1. Texto de Debug
    this.debugText = this.add.text(20, 20, 'SISTEMA INICIADO...\nAGUARDANDO INPUT', {
        fontFamily: 'monospace',
        fontSize: '16px', // Aumentei um pouco a fonte para a nova resolução
        color: '#00ff00'
    });

    // 2. Mapeamento de Teclas
    this.keys = this.input.keyboard.addKeys({
        // Movimentação
        up: Phaser.Input.Keyboard.KeyCodes.UP,
        w: Phaser.Input.Keyboard.KeyCodes.W,
        
        down: Phaser.Input.Keyboard.KeyCodes.DOWN,
        s: Phaser.Input.Keyboard.KeyCodes.S,
        
        left: Phaser.Input.Keyboard.KeyCodes.LEFT,
        a: Phaser.Input.Keyboard.KeyCodes.A,
        
        right: Phaser.Input.Keyboard.KeyCodes.RIGHT,
        d: Phaser.Input.Keyboard.KeyCodes.D,
        
        // Ações
        jump_z: Phaser.Input.Keyboard.KeyCodes.Z,
        jump_space: Phaser.Input.Keyboard.KeyCodes.SPACE,
        arcade_u: Phaser.Input.Keyboard.KeyCodes.U, 
        arcade_j: Phaser.Input.Keyboard.KeyCodes.J, 
        
        dash_x: Phaser.Input.Keyboard.KeyCodes.X,
        dash_shift: Phaser.Input.Keyboard.KeyCodes.SHIFT,
        arcade_i: Phaser.Input.Keyboard.KeyCodes.I,
        arcade_k: Phaser.Input.Keyboard.KeyCodes.K
    });
}

function update() {
    // 1. Polling de Inputs
    input.up = this.keys.up.isDown || this.keys.w.isDown;
    input.down = this.keys.down.isDown || this.keys.s.isDown;
    input.left = this.keys.left.isDown || this.keys.a.isDown;
    input.right = this.keys.right.isDown || this.keys.d.isDown;
    
    input.jump = this.keys.jump_z.isDown || this.keys.jump_space.isDown || this.keys.arcade_u.isDown || this.keys.arcade_j.isDown;
    input.dash = this.keys.dash_x.isDown || this.keys.dash_shift.isDown || this.keys.arcade_i.isDown || this.keys.arcade_k.isDown;

    // 2. Feedback Visual Atualizado
    this.debugText.setText(
        `STATUS DO SISTEMA (800x600):\n` +
        `--------------------------\n` +
        `UP:    ${input.up ? '[ON]' : ' . '}\n` +
        `DOWN:  ${input.down ? '[ON]' : ' . '}\n` +
        `LEFT:  ${input.left ? '[ON]' : ' . '}\n` +
        `RIGHT: ${input.right ? '[ON]' : ' . '}\n` +
        `--------------------------\n` +
        `JUMP:  ${input.jump ? '[ON]' : ' . '}\n` +
        `DASH:  ${input.dash ? '[ON]' : ' . '}`
    );
}
