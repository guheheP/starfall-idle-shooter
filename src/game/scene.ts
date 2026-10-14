import Phaser from 'phaser';
import { Simulation, MODULES } from './simulation';
import { GameAudio } from './audio';
import { RARITIES, WEAPON_BASES } from './loot';
import { PART_BASES } from './parts';
import { CombatVisuals } from './combat-visuals';
import { EnvironmentVisuals } from './environment-visuals';
import { SPACE_BACKGROUNDS, SECTOR_SCENERY } from './visual-assets';
import { bossTexture, bossCoreNodes, makeBossTextures } from './boss-visuals';
import { ELITES } from './sectors';
import { enhancementLevel } from './enhancement';
import { makeShipTextures } from './ship-visuals';
import { makeEnemyTextures, EnemyVisuals } from './enemy-visuals';
import { drawProjectiles } from './projectile-visuals';
import { DestructionVisuals } from './destruction-visuals';
import { useCompactHull } from './render-quality';
import { WORLD_WIDTH as W, WORLD_HEIGHT as H, type Enemy, type GameEvent, type GameInput } from './types';

interface Spark { x: number; y: number; vx: number; vy: number; life: number; max: number; color: number; size: number; }
interface Ring { x: number; y: number; life: number; max: number; size: number; color: number; }
interface EnemyView { image: Phaser.GameObjects.Image; glow: Phaser.GameObjects.Image; label?: Phaser.GameObjects.Text; }
interface Debris { x:number; y:number; vx:number; vy:number; angle:number; spin:number; life:number; max:number; size:number; color:number; }
interface EnergyLink { points:{x:number;y:number}[]; life:number; max:number; color:number; }
interface LifeWisp { x:number; y:number; life:number; max:number; }

export class SpaceScene extends Phaser.Scene {
  private background!: Phaser.GameObjects.Image;
  private viewWidth = W;
  private viewHeight = H;
  private cssZoom = 1;
  private compactHulls = false;
  private stars!: Phaser.GameObjects.Graphics;
  private effects!: Phaser.GameObjects.Graphics;
  private combatVisuals!: CombatVisuals;
  private environmentVisuals!: EnvironmentVisuals;
  private lastSector = '';
  private shots!: Phaser.GameObjects.Graphics;
  private hostileShots!: Phaser.GameObjects.Graphics;
  private aimMarker!: Phaser.GameObjects.Graphics;
  private destructionVisuals!: DestructionVisuals;
  private enemyVisuals!: EnemyVisuals;
  private bars!: Phaser.GameObjects.Graphics;
  private playerImage!: Phaser.GameObjects.Image;
  private playerGlow!: Phaser.GameObjects.Image;
  private wingImage!: Phaser.GameObjects.Image;
  private bodyImage!: Phaser.GameObjects.Image;
  private droneImages: Phaser.GameObjects.Image[] = [];
  private exhaust!: Phaser.GameObjects.Graphics;
  private enemyViews = new Map<number, EnemyView>();
  private sparks: Spark[] = [];
  private rings: Ring[] = [];
  private debris: Debris[] = [];
  private links: EnergyLink[] = [];
  private wisps: LifeWisp[] = [];
  private transientViews = new Set<Phaser.GameObjects.Image | Phaser.GameObjects.Text>();
  private trailTimer = 0;
  private starData = Array.from({length: 130}, () => ({x:Math.random()*W, y:Math.random()*H, z:0.2+Math.random()*0.8}));
  private keys = new Set<string>();
  private pointerGesture: Phaser.Input.Pointer | null = null;
  private touchDrag: { x: number; y: number; playerX: number; playerY: number } | null = null;
  private accumulator = 0;
  private elapsed = 0;
  private previousX = W / 2;
  private rewardCount = 0;
  private motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
  private reducedMotion = this.motionPreference.matches;
  private onMotionPreferenceChange = (event: MediaQueryListEvent) => { this.reducedMotion = event.matches; };
  private onVisibilityChange = () => {
    if (this.inputBlocked()) this.clearGameplayInput();
    this.tweens.paused = this.inputBlocked();
  };
  private onKeyDown = (event: KeyboardEvent) => {
    if (this.inputBlocked()) { this.clearGameplayInput(); return; }
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
    const active = document.activeElement;
    if (active instanceof HTMLElement && (active.closest('dialog[open]') || /INPUT|TEXTAREA|SELECT/.test(active.tagName))) return;
    const key = event.key.toLowerCase();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'].includes(key)) {
      this.keys.add(key);
      event.preventDefault();
    }
    if (event.code === 'Space' && !event.repeat && !(active instanceof HTMLButtonElement)) {
      event.preventDefault();
      if (!this.sim.paused) this.sim.activateOverdrive();
    }
    this.audio.enabled = this.sim.state.sound;
    this.audio.unlock();
  };
  private onKeyUp = (event: KeyboardEvent) => { this.keys.delete(event.key.toLowerCase()); };
  private onBlur = () => this.clearGameplayInput();
  private onPointerDown = (pointer: Phaser.Input.Pointer) => {
    if (this.inputBlocked()) { this.clearGameplayInput(); return; }
    this.pointerGesture = pointer;
    const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    this.touchDrag = pointer.wasTouch ? { x: world.x, y: world.y, playerX: this.sim.player.x, playerY: this.sim.player.y } : null;
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    this.audio.enabled = this.sim.state.sound;
    this.audio.unlock();
  };
  private onPointerUp = (pointer: Phaser.Input.Pointer) => {
    if (this.pointerGesture !== pointer) return;
    this.pointerGesture = null;
    this.touchDrag = null;
  };

  private inputBlocked(): boolean {
    return this.sim.paused || document.hidden || document.querySelector('dialog[open]') !== null;
  }

  private clearGameplayInput(): void {
    this.keys.clear();
    // A held pointer needs a fresh canvas press after a menu, blur, or resize.
    this.pointerGesture = null;
    this.touchDrag = null;
  }

  constructor(private sim: Simulation, private audio: GameAudio, private notify: (event:GameEvent) => void) {
    super({key:'Space'});
  }

  preload() {
    for (const asset of SPACE_BACKGROUNDS) this.load.image(asset.key, asset.path);
  }

  create() {
    this.makeTextures();
    this.background = this.add.image(W / 2, H / 2, this.textures.exists('nebula-art')?'nebula-art':'space-background').setTint(0xc3d5e8);
    this.stars = this.add.graphics().setDepth(1);
    if(!this.textures.exists('nebula-art')) this.add.image(565, 162, 'planet').setAlpha(0.8).setDepth(2);
    const grid = this.add.graphics().setDepth(3);
    grid.lineStyle(1, 0x4b8399, 0.055);
    for (let i = -6; i <= 6; i++) grid.lineBetween(W/2+i*100, H, W/2+i*25, 470);
    for (let i = 0; i < 8; i++) {
      const y = 470 + Math.pow(i/7, 1.7)*350;
      grid.lineBetween(0, y, W, y);
    }
    grid.lineStyle(1, 0x92c5ce, 0.1);
    if(!this.textures.exists('nebula-art')) grid.strokeEllipse(548, 167, 535, 158);
    grid.lineBetween(26, 450, 26, 760);
    grid.lineBetween(W-26, 450, W-26, 760);
    for(let i=0; i<11; i++) {
      grid.lineBetween(26, 450+i*30, i%5===0 ? 36 : 31, 450+i*30);
      grid.lineBetween(W-26, 450+i*30, W-(i%5===0 ? 36 : 31), 450+i*30);
    }
    this.exhaust = this.add.graphics().setDepth(7);
    this.playerGlow = this.add.image(this.sim.player.x, this.sim.player.y, 'glow').setTint(0x58dbe9).setScale(0.95).setAlpha(0.18).setDepth(8).setBlendMode(Phaser.BlendModes.ADD);
    this.playerImage = this.add.image(this.sim.player.x, this.sim.player.y, 'ship-standard-pulse').setDepth(9).setScale(0.49);
    this.wingImage = this.add.image(this.sim.player.x, this.sim.player.y, 'part-wing-focus').setDepth(8.5).setScale(.49);
    this.bodyImage = this.add.image(this.sim.player.x, this.sim.player.y+10, 'part-body-bastion').setDepth(9.2).setScale(.49);
    this.shots = this.add.graphics().setDepth(10);
    this.hostileShots = this.add.graphics().setDepth(16);
    this.aimMarker = this.add.graphics().setDepth(16.1);
    this.bars = this.add.graphics().setDepth(11);
    this.effects = this.add.graphics().setDepth(12);
    this.combatVisuals = new CombatVisuals(this);
    this.destructionVisuals = new DestructionVisuals(this);
    this.enemyVisuals = new EnemyVisuals(this);
    this.environmentVisuals = new EnvironmentVisuals(this);
    this.fitViewport(this.scale.gameSize);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.fitViewport, this);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.motionPreference.addEventListener('change', this.onMotionPreferenceChange);
    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown);
    this.input.on(Phaser.Input.Events.POINTER_UP, this.onPointerUp);
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onPointerUp);
    let detached = false;
    const detach = () => {
      if(detached)return;
      detached = true;
      this.clearGameplayInput();
      this.scale.off(Phaser.Scale.Events.RESIZE, this.fitViewport, this);
      this.input.off(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown);
      this.input.off(Phaser.Input.Events.POINTER_UP, this.onPointerUp);
      this.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onPointerUp);
      window.removeEventListener('keydown', this.onKeyDown);
      window.removeEventListener('keyup', this.onKeyUp);
      window.removeEventListener('blur', this.onBlur);
      document.removeEventListener('visibilitychange', this.onVisibilityChange);
      this.motionPreference.removeEventListener('change', this.onMotionPreferenceChange);
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, detach);
    this.events.once(Phaser.Scenes.Events.DESTROY, detach);
  }

  private fitViewport(size: Phaser.Structs.Size) {
    this.clearGameplayInput();
    const width=Math.max(1,size.width), height=Math.max(1,size.height);
    const zoom=Math.min(width/W,height/H);
    // The camera uses backing pixels; detail and labels follow the visible size.
    this.cssZoom=Math.min(this.scale.displaySize.width/W,this.scale.displaySize.height/H);
    this.compactHulls=useCompactHull(this.cssZoom);
    this.cameras.main.setSize(width,height).setZoom(zoom).centerOn(W/2,H/2);
    this.viewWidth=width/zoom;
    this.viewHeight=height/zoom;
    this.fitBackground();
  }

  private fitBackground() {
    const texture=this.background.texture.getSourceImage();
    this.background.setScale(Math.max(this.viewWidth/texture.width,this.viewHeight/texture.height));
  }

  private hullTexture(key: string): string {
    return this.compactHulls ? `${key}-compact` : key;
  }

  update(_time: number, delta: number) {
    const blocked = this.inputBlocked();
    if (blocked) this.clearGameplayInput();
    this.tweens.paused = blocked;
    if(blocked){this.cameras.main.shakeEffect.reset();this.cameras.main.flashEffect.reset();}
    const dt = Math.min(delta / 1000, 0.1);
    this.audio.enabled = this.sim.state.sound;
    if (!blocked) {
      this.elapsed += dt;
      const pointer = this.input.activePointer;
      const input: GameInput = {
        x: Number(this.keys.has('d') || this.keys.has('arrowright')) - Number(this.keys.has('a') || this.keys.has('arrowleft')),
        y: Number(this.keys.has('s') || this.keys.has('arrowdown')) - Number(this.keys.has('w') || this.keys.has('arrowup')),
      };
      if (!pointer.isDown) this.onPointerUp(pointer);
      if (pointer === this.pointerGesture && pointer.isDown && pointer.x>=0 && pointer.x<=this.scale.width && pointer.y>=0 && pointer.y<=this.scale.height) {
        const world=this.cameras.main.getWorldPoint(pointer.x,pointer.y);
        // Touch moves relative to the ship so it never snaps underneath a finger.
        input.target=this.touchDrag ? {x:this.touchDrag.playerX+world.x-this.touchDrag.x,y:this.touchDrag.playerY+world.y-this.touchDrag.y} : {x:world.x,y:world.y};
      }
      this.accumulator += dt;
      while(this.accumulator >= 1/60) {
        this.sim.update(1/60, input);
        this.accumulator -= 1/60;
      }
    } else this.accumulator = 0;
    const frameEvents=this.sim.drainEvents();
    const bossDestroyed=frameEvents.some(event=>event.kind==='kill'&&event.boss);
    for(const event of frameEvents) {
      this.handleEvent(event);
      this.destructionVisuals.event(event,this.sim.state.effects&&!this.reducedMotion);
      this.combatVisuals.event(event,this.sim.state.weapon,this.sim.state.effects&&!this.reducedMotion);
      const quietLoot=event.kind==='loot'&&(event.autoSold||event.item&&RARITIES.find(rarity=>rarity.id===event.item!.rarity)!.rank<2);
      if(!quietLoot)this.audio.play(event.kind,event.kind==='kill'?bossDestroyed:event.boss,event.weapon??this.sim.state.weapon);
      this.notify(event);
    }
    this.showCombatRewards(frameEvents);
    const fullEffects=this.sim.state.effects&&!this.reducedMotion;
    if(!fullEffects) {
      this.sparks=[];this.rings=[];this.debris=[];this.links=[];this.wisps=[];
      this.cameras.main.shakeEffect.reset();
      this.cameras.main.flashEffect.reset();
      if(this.transientViews.size) {
        this.tweens.killAll();
        for(const view of this.transientViews) view.destroy();
        this.transientViews.clear();this.rewardCount=0;
      }
    }
    this.renderStars(blocked || !fullEffects ? 0 : dt);
    const sector=this.sim.getSector();
    const scenery=SECTOR_SCENERY[sector.id];
    const backdrop=this.textures.exists(scenery.key)?scenery.key:this.textures.exists('nebula-art')?'nebula-art':'space-background';
    if(this.background.texture.key!==backdrop){this.background.setTexture(backdrop);this.fitBackground();}
    this.background.setTint(scenery.tint);
    this.environmentVisuals.render(blocked||!fullEffects?0:dt,sector,this.viewWidth,this.viewHeight,scenery.painted&&backdrop===scenery.key);
    if(sector.id!==this.lastSector){
      const first=!this.lastSector;this.lastSector=sector.id;
      if(!first&&fullEffects&&this.transientViews.size<92){
        const label=this.add.text(W/2,150,sector.name,{fontFamily:'Noto Sans JP, sans-serif',fontSize:'22px',color:`#${sector.color.toString(16).padStart(6,'0')}`,stroke:'#06111d',strokeThickness:5}).setOrigin(.5).setDepth(14).setAlpha(0);
        this.transientViews.add(label);
        this.tweens.add({targets:label,alpha:1,y:143,duration:300,yoyo:true,hold:1800,onComplete:()=>{this.transientViews.delete(label);label.destroy();}});
      }
    }
    this.trailTimer-=blocked?0:dt;
    this.renderPlayer();
    this.renderEnemies();
    this.enemyVisuals.render(this.sim.enemies,this.elapsed,fullEffects);
    this.renderBullets();
    const effectDt=blocked?0:dt;
    this.renderEffects(effectDt);
    this.destructionVisuals.render(effectDt,fullEffects);
    this.combatVisuals.render(effectDt,this.sim.bullets,fullEffects);
  }

  private makeTextures() {
    const bg = this.textures.createCanvas('space-background', W, H)!;
    const ctx = bg.context;
    ctx.fillStyle='#050e1b'; ctx.fillRect(0,0,W,H);
    const gradient = ctx.createRadialGradient(520,80,10,400,120,640);
    gradient.addColorStop(0,'#193b48'); gradient.addColorStop(0.45,'#0b202e'); gradient.addColorStop(1,'#070f1d');
    ctx.fillStyle=gradient; ctx.fillRect(0,0,W,H);
    for(let i=0;i<5;i++) {
      const haze = ctx.createRadialGradient(120+i*100,190+i*86,0,120+i*100,190+i*86,160);
      haze.addColorStop(0,`rgba(30,87,111,${0.07+i*0.01})`); haze.addColorStop(1,'rgba(20,60,90,0)');
      ctx.fillStyle=haze;ctx.fillRect(0,0,W,H);
    }
    const vignette = ctx.createLinearGradient(0,0,0,H);
    vignette.addColorStop(0,'rgba(3,10,20,.08)'); vignette.addColorStop(0.6,'rgba(3,10,20,0)'); vignette.addColorStop(1,'rgba(3,10,20,.7)');
    ctx.fillStyle=vignette;ctx.fillRect(0,0,W,H);bg.refresh();
    const planet=this.textures.createCanvas('planet',420,420)!;
    const pc=planet.context;
    const atmosphere=pc.createRadialGradient(210,210,154,210,210,188);
    atmosphere.addColorStop(0,'rgba(48,112,134,.3)');atmosphere.addColorStop(1,'rgba(48,112,134,0)');
    pc.fillStyle=atmosphere;pc.fillRect(0,0,420,420);
    pc.save();pc.beginPath();pc.arc(210,210,159,0,Math.PI*2);pc.clip();
    const pg=pc.createLinearGradient(82,88,325,340);
    pg.addColorStop(0,'#497a83');pg.addColorStop(0.26,'#284d5d');pg.addColorStop(0.58,'#112b3c');pg.addColorStop(1,'#071321');
    pc.fillStyle=pg;pc.fillRect(0,0,420,420);
    pc.strokeStyle='rgba(146,191,191,.10)';pc.lineWidth=1;
    for(let i=0;i<15;i++){pc.beginPath();pc.ellipse(200,95+i*19,173,26+i%3*5,-0.18,0,Math.PI*2);pc.stroke();}
    const shadow=pc.createRadialGradient(317,269,68,308,263,230);
    shadow.addColorStop(0,'rgba(3,12,23,.9)');shadow.addColorStop(0.8,'rgba(3,12,23,.3)');shadow.addColorStop(1,'rgba(3,12,23,0)');
    pc.fillStyle=shadow;pc.fillRect(0,0,420,420);pc.restore();
    pc.strokeStyle='rgba(113,180,192,.3)';pc.lineWidth=1.4;pc.beginPath();pc.arc(210,210,159,Math.PI*.88,Math.PI*1.65);pc.stroke();planet.refresh();
    const glow=this.textures.createCanvas('glow',128,128)!;
    const gc=glow.context;const gg=gc.createRadialGradient(64,64,0,64,64,64);
    gg.addColorStop(0,'rgba(255,255,255,.8)');gg.addColorStop(.25,'rgba(255,255,255,.22)');gg.addColorStop(1,'rgba(255,255,255,0)');
    gc.fillStyle=gg;gc.fillRect(0,0,128,128);glow.refresh();
    const crystal=this.textures.createCanvas('loot-crystal',48,60)!;
    const cc=crystal.context;
    cc.shadowColor='#b4edff';cc.shadowBlur=12;
    cc.fillStyle='#94d9ff';cc.beginPath();cc.moveTo(24,7);cc.lineTo(37,29);cc.lineTo(24,52);cc.lineTo(11,29);cc.closePath();cc.fill();
    cc.shadowBlur=0;cc.fillStyle='#edffff';cc.beginPath();cc.moveTo(24,7);cc.lineTo(24,29);cc.lineTo(11,29);cc.closePath();cc.fill();
    cc.fillStyle='#518ebb';cc.beginPath();cc.moveTo(24,29);cc.lineTo(37,29);cc.lineTo(24,52);cc.closePath();cc.fill();
    cc.strokeStyle='#e5faff';cc.lineWidth=1.2;cc.beginPath();cc.moveTo(24,7);cc.lineTo(37,29);cc.lineTo(24,52);cc.lineTo(11,29);cc.closePath();cc.stroke();crystal.refresh();
    makeShipTextures(this);
    makeEnemyTextures(this);
    makeBossTextures(this);
  }

  private renderStars(dt:number) {
    this.stars.clear();
    for(const star of this.starData) {
      star.y=(star.y+dt*(10+star.z*32))%H;
      this.stars.fillStyle(0xc0e2ea,0.1+star.z*.55);
      const x=(W-this.viewWidth)/2+star.x/W*this.viewWidth;
      const y=(H-this.viewHeight)/2+star.y/H*this.viewHeight;
      this.stars.fillCircle(x,y,star.z>.85?1.5:.8);
      if(star.z>.91) {this.stars.lineStyle(1,0xaed2dc,.13);this.stars.lineBetween(x,y-3,x,y+3);}
    }
  }

  private renderPlayer() {
    const p=this.sim.player;
    const module=MODULES.find(item=>item.id===this.sim.state.module)!;
    const color=WEAPON_BASES[this.sim.state.weapon].color;
    const texture=this.hullTexture(`ship-${module.id}-${this.sim.state.weapon}`);
    const wing=this.sim.getEquippedPart('wing'),body=this.sim.getEquippedPart('body'),drone=this.sim.getEquippedPart('drone');
    const bodyColor=PART_BASES[body.model].color,droneColor=PART_BASES[drone.model].color;
    const stats=this.sim.getStats();
    const full=this.sim.state.effects&&!this.reducedMotion;
    const recovering=this.sim.status==='recovering';
    if(this.playerImage.texture.key!==texture)this.playerImage.setTexture(texture);
    this.playerImage.setVisible(!recovering).setPosition(p.x,p.y);
    this.playerGlow.setVisible(!recovering&&full);
    const movement=p.x-this.previousX;
    this.playerImage.rotation=Phaser.Math.Clamp(movement*.016,-.16,.16);
    this.previousX=p.x;
    const hullAlpha=p.invulnerable>0&&full&&Math.sin(this.elapsed*30)>0?.55:1;
    this.playerImage.setAlpha(hullAlpha);
    const wingTexture=this.hullTexture(`part-wing-${wing.model}`),bodyTexture=this.hullTexture(`part-body-${body.model}`);
    if(this.wingImage.texture.key!==wingTexture)this.wingImage.setTexture(wingTexture);
    if(this.bodyImage.texture.key!==bodyTexture)this.bodyImage.setTexture(bodyTexture);
    this.wingImage.setVisible(!recovering).setPosition(p.x,p.y+3).setRotation(this.playerImage.rotation).setAlpha(hullAlpha);
    this.bodyImage.setVisible(!recovering).setPosition(p.x,p.y+10).setRotation(this.playerImage.rotation).setAlpha(hullAlpha);
    this.playerGlow.setPosition(p.x,p.y+15).setTint(color).setScale(this.sim.overdriveLeft>0?1.45:1.03).setAlpha(this.sim.overdriveLeft>0?.45:.24);
    this.exhaust.clear();
    if(recovering){for(const image of this.droneImages)image.setVisible(false);return;}
    const burst=this.sim.overdriveLeft>0;
    const empowered=stats.highShieldDamage>0&&p.hp>=stats.maxHp*.7;
    const flicker=full?Math.sin(this.elapsed*36)*5:0;
    for(const offset of [-6,6]){
      const x=p.x+offset;
      const start=p.y+39;
      if(full){
        this.exhaust.lineStyle(burst?16:10,color,.06);this.exhaust.lineBetween(x,start,x,start+(burst?111:65)+flicker);
        this.exhaust.fillStyle(color,.19);this.exhaust.fillTriangle(x-6,start,x+6,start,x,start+(burst?91:56)+flicker);
        this.exhaust.fillStyle(color,.62);this.exhaust.fillTriangle(x-3,start,x+3,start,x,start+(burst?61:32)+flicker*.5);
      }
      this.exhaust.fillStyle(0xf2ffff,.9);this.exhaust.fillTriangle(x-2,start,x+2,start,x,start+(full?15:7));
    }
    if(full){
      const grade=(enhancementLevel(this.sim.getEquippedWeapon())+enhancementLevel(wing)+enhancementLevel(body))/30;
      if(grade>0){
        this.exhaust.lineStyle(1,color,.24+grade*.26);
        for(const side of [-1,1])for(let index=0;index<Math.ceil(grade*3);index++){
          const x=p.x+side*(20+index*5),y=p.y+22-index*4;
          this.exhaust.lineBetween(x,y,x+side*3,y-6);
        }
      }
      this.exhaust.lineStyle(module.id==='bulwark'?1.8:1.1,module.color,burst?.65:module.id==='bulwark'?.34:.14);
      this.exhaust.strokeEllipse(p.x,p.y+4,112,124);
      if(module.id==='bulwark'){
        this.exhaust.lineStyle(1,module.color,.2);
        this.exhaust.strokePoints(Array.from({length:6},(_,i)=>new Phaser.Geom.Point(p.x+Math.cos(i*Math.PI/3+Math.PI/6)*63,p.y+Math.sin(i*Math.PI/3+Math.PI/6)*63)),true);
      }
      if(body.model==='bastion'){
        this.exhaust.lineStyle(1.2,bodyColor,.2);
        this.exhaust.strokePoints(Array.from({length:6},(_,i)=>new Phaser.Geom.Point(p.x+Math.cos(i*Math.PI/3+Math.PI/6)*57,p.y+Math.sin(i*Math.PI/3+Math.PI/6)*57)),true);
      }
      if(body.model==='reactor'&&p.hp/stats.maxHp>=.7){
        this.exhaust.lineStyle(7,bodyColor,.08);this.exhaust.strokeCircle(p.x,p.y+10,27);
        this.exhaust.lineStyle(1,bodyColor,.65);
        for(let i=0;i<3;i++){const a=this.elapsed*1.8+i*Math.PI*2/3;this.exhaust.beginPath();this.exhaust.arc(p.x,p.y+10,23,a,a+.9,false);this.exhaust.strokePath();}
      }
      if(body.model==='siphon'){
        this.exhaust.lineStyle(1,bodyColor,.22);this.exhaust.strokeEllipse(p.x,p.y+10,54,67);
      }
      if(empowered){
        this.exhaust.lineStyle(1.1,0xffdc99,.72);
        for(let i=0;i<3;i++){const a=this.elapsed*.9+i*Math.PI*2/3;this.exhaust.beginPath();this.exhaust.arc(p.x,p.y+10,31,a,a+.42,false);this.exhaust.strokePath();}
        for(const side of [-1,1]){
          this.exhaust.lineStyle(2,0xffefbf,.55);this.exhaust.lineBetween(p.x+side*6,p.y+44,p.x+side*6,p.y+54);
        }
      }
      if(wing.model==='cascade'){
        this.exhaust.lineStyle(1,PART_BASES.cascade.color,.55);
        for(const side of [-1,1])this.exhaust.strokePoints([new Phaser.Geom.Point(p.x+side*19,p.y+6),new Phaser.Geom.Point(p.x+side*29,p.y+15),new Phaser.Geom.Point(p.x+side*34,p.y+11)],false);
      }
      const angle=this.elapsed*1.4;
      if(this.sim.state.weapon==='orbit')for(let i=0;i<3;i++){
        const a=angle+i*Math.PI*2/3,x=p.x+Math.cos(a)*51,y=p.y+Math.sin(a)*34;
        this.exhaust.lineStyle(1,color,.32);this.exhaust.strokeEllipse(p.x,p.y,102,68);
        this.exhaust.fillStyle(color,.9);this.exhaust.fillTriangle(x,y-5,x-4,y+2,x+4,y+2);
      }
      if(burst){
        this.exhaust.lineStyle(2,color,.85);
        for(let i=0;i<3;i++){
          this.exhaust.beginPath();this.exhaust.arc(p.x,p.y,68+Math.sin(this.elapsed*8)*3,this.elapsed*2+i*Math.PI*2/3,this.elapsed*2+i*Math.PI*2/3+.8,false);this.exhaust.strokePath();
        }
      }
      if((burst||Math.abs(movement)>3)&&this.trailTimer<=0&&!this.sim.paused&&this.transientViews.size<80){
        this.trailTimer=.055;
        const trail=this.add.image(p.x,p.y,texture).setScale(.49).setRotation(this.playerImage.rotation).setTint(color).setAlpha(.24).setDepth(6).setBlendMode(Phaser.BlendModes.ADD);
        this.transientViews.add(trail);
        this.tweens.add({targets:trail,y:p.y+35,alpha:0,duration:300,onComplete:()=>{this.transientViews.delete(trail);trail.destroy();}});
      }
    }
    if(p.invulnerable>0){this.exhaust.lineStyle(1.5,module.color,.6);this.exhaust.strokeCircle(p.x,p.y,13);}
    const count=Math.min(4,Math.max(0,Math.floor(stats.droneCount)));
    while(this.droneImages.length>count)this.droneImages.pop()!.destroy();
    while(this.droneImages.length<count)this.droneImages.push(this.add.image(p.x,p.y,this.hullTexture(`part-drone-${drone.model}`)).setScale(.34).setDepth(9.3));
    for(let i=0;i<count;i++){
      const offset=(i%2===0?-1:1)*(67+Math.floor(i/2)*29);
      const y=p.y+20+(full?Math.sin(this.elapsed*2+i)*7:0),x=p.x+offset;
      const image=this.droneImages[i],key=this.hullTexture(`part-drone-${drone.model}`);
      if(image.texture.key!==key)image.setTexture(key);
      image.setVisible(true).setPosition(x,y).setRotation(full?Math.sin(this.elapsed*1.5+i)*.05:0);
      if(full){
        this.exhaust.lineStyle(5,droneColor,.14);this.exhaust.lineBetween(x,y+11,x,y+31);
        this.exhaust.lineStyle(1.6,droneColor,.7);this.exhaust.lineBetween(x,y+11,x,y+23);
        if(drone.model==='frost'){
          this.exhaust.lineStyle(.8,droneColor,.32);this.exhaust.strokeCircle(x,y,19);
        }
        if(drone.model==='mender'&&p.hp<stats.maxHp){
          this.exhaust.lineStyle(6,droneColor,.035);this.exhaust.lineBetween(x,y,p.x,p.y+10);
          this.exhaust.lineStyle(.8,droneColor,.25);this.exhaust.lineBetween(x,y,p.x,p.y+10);
          const t=(this.elapsed*1.4+i*.3)%1;this.exhaust.fillStyle(0xcaffe0,.8);this.exhaust.fillCircle(x+(p.x-x)*t,y+(p.y+10-y)*t,1.8);
        }
      }
    }
  }

  private renderEnemies() {
    const alive=new Set<number>();this.bars.clear();
    const full=this.sim.state.effects&&!this.reducedMotion;
    for(const enemy of this.sim.enemies){
      alive.add(enemy.id);
      const texture=this.hullTexture(enemy.kind==='boss'?bossTexture(enemy):enemy.elite?`${enemy.kind}-elite-${enemy.elite}`:`${enemy.kind}-metal`);
      let view=this.enemyViews.get(enemy.id);
      if(!view){
        const glow=this.add.image(enemy.x,enemy.y,'glow').setAlpha(.13).setDepth(4).setBlendMode(Phaser.BlendModes.ADD);
        const image=this.add.image(enemy.x,enemy.y,texture).setDepth(5);
        const scale=enemy.kind==='boss'?1.12:enemy.kind==='scout'?1.02:enemy.kind==='tank'?1.02:.98;
        image.setScale(scale*(enemy.elite?.54:.5));glow.setScale(enemy.kind==='boss'?2.8:enemy.elite?1.1:.8);
        view={image,glow};this.enemyViews.set(enemy.id,view);
        if(enemy.kind==='boss')view.label=this.add.text(enemy.x,enemy.y-94,'',{fontFamily:'Consolas, monospace',fontSize:'11px',color:'#efbf96',stroke:'#07121e',strokeThickness:2}).setOrigin(.5).setDepth(6);
        else if(enemy.elite)view.label=this.add.text(enemy.x,enemy.y-45,ELITES[enemy.elite].name.replace('精鋭',''),{fontFamily:'Noto Sans JP, sans-serif',fontSize:'10px',color:`#${ELITES[enemy.elite].color.toString(16).padStart(6,'0')}`,stroke:'#07121e',strokeThickness:3}).setOrigin(.5).setDepth(6);
      }
      view.image.setPosition(enemy.x,enemy.y).clearTint();
      if(view.image.texture.key!==texture)view.image.setTexture(texture);
      view.image.setRotation(enemy.kind!=='tank'&&enemy.kind!=='boss'&&full?Math.cos(enemy.age*.7+enemy.id)*.05:0);
      const phase=enemy.phase??1;
      const accent=enemy.elite?ELITES[enemy.elite].color:enemy.kind==='boss'&&enemy.pattern==='spiral'?0xbd9fed:enemy.kind==='boss'&&enemy.pattern==='cross'?0x86deca:enemy.kind==='tank'?0xffd08a:0xff9673;
      if(enemy.hitFlash>0&&full)view.image.setTint(0xffe6cc);
      if((enemy.slowLeft??0)>0){
        view.image.setTint(0xb6eaff);
        this.bars.lineStyle(1.2,0x98ebff,.7);this.bars.strokeCircle(enemy.x,enemy.y,enemy.radius+5);
        for(let i=0;i<4;i++){
          const a=i*Math.PI/2+Math.PI/4,r=enemy.radius*.9,x=enemy.x+Math.cos(a)*r,y=enemy.y+Math.sin(a)*r;
          this.bars.fillStyle(0xcefbff,.75);this.bars.fillTriangle(x,y-5,x-3,y+3,x+3,y+3);
        }
      }
      view.glow.setVisible(full).setPosition(enemy.x,enemy.y).setTint(enemy.hitFlash>0?0xcff9ff:accent).setAlpha(enemy.hitFlash>0?.55:phase===2?.33:.19);
      this.bars.fillStyle(accent,.8);this.bars.fillCircle(enemy.x,enemy.y-enemy.radius*.7,enemy.kind==='boss'?4:2);
      if(enemy.hitFlash>0&&full){this.bars.lineStyle(1.5,0xd8fbff,.6);this.bars.strokeCircle(enemy.x,enemy.y,enemy.radius+3);}
      if(enemy.kind!=='boss'&&(enemy.elite||enemy.hp<enemy.maxHp))this.drawHealth(enemy);
      this.drawTelegraph(enemy,accent);
      if(enemy.elite){
        view.label?.setVisible(this.cssZoom>=.45).setPosition(enemy.x,enemy.y-enemy.radius-27);
        this.bars.lineStyle(1,accent,.45);
        if(enemy.elite==='vanguard'){
          this.bars.strokePoints([new Phaser.Geom.Point(enemy.x-enemy.radius-5,enemy.y-6),new Phaser.Geom.Point(enemy.x,enemy.y+enemy.radius+8),new Phaser.Geom.Point(enemy.x+enemy.radius+5,enemy.y-6)],false);
        }else if(enemy.elite==='sniper'){
          this.bars.lineBetween(enemy.x-enemy.radius-7,enemy.y,enemy.x-enemy.radius-2,enemy.y);
          this.bars.lineBetween(enemy.x+enemy.radius+2,enemy.y,enemy.x+enemy.radius+7,enemy.y);
        }else{
          this.bars.strokeEllipse(enemy.x,enemy.y,enemy.radius*2.8,enemy.radius*1.7);
        }
      }
      if(enemy.kind==='boss'){
        if(full){
          const rotation=this.elapsed*(phase===2?2.6:1.3);
          for(const node of bossCoreNodes(enemy)){
            const {x,y,radius:r}=node;
            this.bars.lineStyle(5,accent,.08);this.bars.strokeCircle(x,y,r+3);
            this.bars.lineStyle(1.5,accent,.8);
            for(let i=0;i<3;i++){
              const a=rotation+i*Math.PI*2/3;
              this.bars.beginPath();this.bars.arc(x,y,r,a,a+1.05,false);this.bars.strokePath();
            }
            this.bars.fillStyle(0xfff4d5,.8);this.bars.fillCircle(x,y,r>16?4:2.4);
          }
          this.bars.lineStyle(phase===2?1.5:.8,accent,phase===2?.38:.15);
          if(enemy.pattern==='cross'){
            this.bars.strokePoints([[-106,-40],[-68,-57],[68,-57],[106,-40],[117,0],[106,42],[68,60],[-68,60],[-106,42],[-117,0]].map(([x,y])=>new Phaser.Geom.Point(enemy.x+x,enemy.y+y)),true);
          }else if(enemy.pattern==='spiral'){
            for(let i=0;i<3;i++){const a=this.elapsed*.4+i*Math.PI*2/3;this.bars.beginPath();this.bars.arc(enemy.x,enemy.y,phase===2?64:58,a,a+1.2,false);this.bars.strokePath();}
          }else this.bars.strokeEllipse(enemy.x,enemy.y,237,118);
        }
        view.label?.setVisible(this.cssZoom>=.45).setPosition(enemy.x,enemy.y-96).setText(`${{fan:'WARDEN',spiral:'HELIX',cross:'BASTION'}[enemy.pattern??'fan']}  /  PHASE ${phase}`);
      }else if(full){
        const width=enemy.kind==='tank'?21:enemy.kind==='fighter'?13:8;
        for(const side of [-1,1]){
          this.bars.lineStyle(5,accent,.07);this.bars.lineBetween(enemy.x+side*width,enemy.y-enemy.radius*.7,enemy.x+side*width,enemy.y-enemy.radius-18);
          this.bars.lineStyle(2,accent,.45);this.bars.lineBetween(enemy.x+side*width,enemy.y-enemy.radius*.7,enemy.x+side*width,enemy.y-enemy.radius-8);
        }
      }
    }
    for(const[id,view]of this.enemyViews)if(!alive.has(id)){view.image.destroy();view.glow.destroy();view.label?.destroy();this.enemyViews.delete(id);}
  }
  private drawHealth(enemy:Enemy) {
    const width=enemy.elite?54:enemy.kind==='tank'?48:30;
    this.bars.fillStyle(0x0b1625,.9);this.bars.fillRect(enemy.x-width/2,enemy.y-enemy.radius-15,width,3);
    this.bars.fillStyle(enemy.elite?ELITES[enemy.elite].color:0xe2a267,.8);this.bars.fillRect(enemy.x-width/2,enemy.y-enemy.radius-15,width*Math.max(0,enemy.hp/enemy.maxHp),3);
  }

  private drawTelegraph(enemy:Enemy,color:number) {
    const boss=enemy.kind==='boss';
    const progress=enemy.elite?enemy.charge??0:boss?Math.max(0,1-enemy.shotTimer/.55):0;
    if(progress<=0)return;
    const target=Math.atan2(this.sim.player.y-enemy.y,this.sim.player.x-enemy.x);
    let angles=[enemy.aimAngle??target];
    if(enemy.elite==='vanguard')angles=[-.18,0,.18].map(offset=>(enemy.aimAngle??target)+offset);
    if(enemy.elite==='barrage')angles=Array.from({length:6},(_,index)=>enemy.age*.28+index*Math.PI/3);
    if(boss){
      const enraged=enemy.phase===2;
      if(enemy.pattern==='spiral')angles=(enraged?[-.4,-.24,-.08,.08,.24,.4]:[-.27,-.09,.09,.27]).map(offset=>Math.PI/2+Math.sin(enemy.age*1.65)*.55+offset);
      else if(enemy.pattern==='cross')angles=[...(enraged?[-.65,-.3,.3,.65]:[-.46,.46]).map(offset=>Math.PI/2+offset),target];
      else angles=(enraged?[-.36,-.24,-.12,0,.12,.24,.36]:[-.3,-.15,0,.15,.3]).map(offset=>target+offset);
    }
    const radius=enemy.radius+7;
    this.bars.lineStyle(1.3,color,.25+progress*.5);
    this.bars.beginPath();this.bars.arc(enemy.x,enemy.y,radius,-Math.PI/2,-Math.PI/2+Math.PI*2*progress,false);this.bars.strokePath();
    for(const angle of angles){
      const dx=Math.cos(angle),dy=Math.sin(angle),length=enemy.elite==='sniper'?380:boss?220:155;
      const y=enemy.y+enemy.radius;
      this.bars.lineStyle(enemy.elite==='sniper'?1.2:.8,color,.06+progress*.2);
      for(let distance=12;distance<length;distance+=20)this.bars.lineBetween(enemy.x+dx*distance,y+dy*distance,enemy.x+dx*(distance+8),y+dy*(distance+8));
      const endX=enemy.x+dx*Math.min(length,110),endY=y+dy*Math.min(length,110);
      this.bars.lineStyle(1,color,.4*progress);this.bars.strokeCircle(endX,endY,3);
    }
  }

  private renderBullets() {
    const full=this.sim.state.effects&&!this.reducedMotion;
    drawProjectiles(this.shots,this.hostileShots,this.sim.bullets,this.elapsed,full);
    this.aimMarker.clear();
    if(this.sim.status==='recovering')return;
    // This marker and threats remain above explosion light, even with effects disabled.
    const p=this.sim.player;
    this.aimMarker.fillStyle(0x061422,.98);this.aimMarker.fillCircle(p.x,p.y,4.5);
    this.aimMarker.lineStyle(.7,0x9debff,.85);this.aimMarker.strokeCircle(p.x,p.y,4.5);
    this.aimMarker.fillStyle(0xf3ffff);this.aimMarker.fillCircle(p.x,p.y,2);
    const rotation=this.playerImage.rotation;
    const nose=(x:number,y:number)=>({x:p.x+x*Math.cos(rotation)-y*Math.sin(rotation),y:p.y+x*Math.sin(rotation)+y*Math.cos(rotation)});
    const tip=nose(0,-23),left=nose(-6,-8),right=nose(6,-8);
    this.aimMarker.lineStyle(.9,0xbbf8ff,.65);
    this.aimMarker.lineBetween(left.x,left.y,tip.x,tip.y);this.aimMarker.lineBetween(tip.x,tip.y,right.x,right.y);
  }
  private handleEvent(e:GameEvent) {
    const x=e.x??this.sim.player.x,y=e.y??this.sim.player.y;
    const full=this.sim.state.effects&&!this.reducedMotion;
    if(!full) return;
    if(e.kind==='kill' || e.kind==='hurt') {
      const color=e.kind==='hurt'?0x8ce3ee:0xffb978;
      const count=full?(e.boss?75:22):(e.boss?12:6);
      for(let i=0;i<count;i++) {
        const angle=Math.random()*Math.PI*2,speed=40+Math.random()*(e.boss?280:160),life=.25+Math.random()*.45;
        this.sparks.push({x,y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,life,max:life,color:i%3===0?0xeaffff:color,size:1+Math.random()*2.5});
      }
      this.rings.push({x,y,life:e.boss?.9:.4,max:e.boss?.9:.4,size:e.boss?170:45,color});
      if(e.kind==='kill') {
        if(full) for(let i=0;i<(e.boss?18:5);i++) {
          const angle=Math.random()*Math.PI*2,speed=35+Math.random()*140,life=.5+Math.random()*.6;
          this.debris.push({x,y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,angle,spin:(Math.random()-.5)*9,life,max:life,size:2+Math.random()*5,color:i%2===0?0xb49377:0x596d7e});
        }
      }
      if(e.boss||e.elite||e.kind==='hurt') this.cameras.main.shake(e.boss?180:55,e.boss?.003:.0007);
    }
    if(e.kind==='hit' && full) for(let i=0;i<3;i++) this.sparks.push({x,y,vx:(Math.random()-.5)*100,vy:20+Math.random()*70,life:.18,max:.18,color:0xd7faff,size:1.3});
    if((e.kind==='hit'||e.kind==='critical')&&(e.healing??0)>0&&this.wisps.length<30)this.wisps.push({x,y,life:.45,max:.45});
    if(e.kind==='boss'){
      const boss=this.sim.enemies.find(enemy=>enemy.kind==='boss');
      if(boss){
        const color=boss.pattern==='spiral'?0xbd9fed:boss.pattern==='cross'?0x86deca:0xffab79;
        this.rings.push({x:boss.x,y:boss.y,life:.85,max:.85,size:130,color});
        this.rings.push({x:boss.x,y:boss.y,life:.55,max:.55,size:90,color});
      }
    }
    if(e.kind==='critical') {
      this.rings.push({x,y,life:.24,max:.24,size:35,color:0xffe5a4});
      for(let i=0;i<10;i++) {
        const angle=Math.PI*2*i/10;
        this.sparks.push({x,y,vx:Math.cos(angle)*210,vy:Math.sin(angle)*210,life:.23,max:.23,color:i%2===0?0xffffed:0xffcf78,size:i%2===0?2.6:1.2});
      }
    }
    if(e.kind==='explosion') {
      const radius=Math.min(360,e.value??80);
      this.rings.push({x,y,life:.36,max:.36,size:radius,color:0xffa268});
      this.rings.push({x,y,life:.25,max:.25,size:radius*.62,color:0xfff1b5});
      for(let i=0;i<12;i++) {
        const angle=Math.random()*Math.PI*2,life=.25+Math.random()*.18;
        this.sparks.push({x,y,vx:Math.cos(angle)*radius*3,vy:Math.sin(angle)*radius*3,life,max:life,color:i%3===0?0xffe9ba:0xff9865,size:2});
      }
    }
    if(e.kind==='chain' && e.points && e.points.length>1) {
      const points:{x:number;y:number}[]=[];
      const targets=e.points.slice(0,7);
      for(let i=0;i<targets.length-1;i++) {
        const a=targets[i],b=targets[i+1],dx=b.x-a.x,dy=b.y-a.y,length=Math.max(1,Math.hypot(dx,dy));
        const segments=Math.min(9,Math.max(3,Math.ceil(length/22)));
        for(let j=0;j<segments;j++) {
          const f=j/segments,bend=j===0?0:(Math.random()-.5)*17;
          points.push({x:a.x+dx*f-dy/length*bend,y:a.y+dy*f+dx/length*bend});
        }
      }
      points.push(targets[targets.length-1]);
      this.links.push({points,life:.22,max:.22,color:0x9ccaff});
      for(const target of targets)this.rings.push({x:target.x,y:target.y,life:.22,max:.22,size:16,color:0x9ac6ff});
    }
    if(e.kind==='loot' && e.item && this.transientViews.size<92) {
      const rarity=RARITIES.find(item=>item.id===e.item!.rarity)!;
      const color=`#${rarity.color.toString(16).padStart(6,'0')}`;
      const textX=Phaser.Math.Clamp(x,105,W-105),textY=Phaser.Math.Clamp(y+18,135,H-120);
      const crystal=this.add.image(x,y,'loot-crystal').setTint(rarity.color).setScale(rarity.rank>=3?.72:.55).setDepth(14).setBlendMode(Phaser.BlendModes.ADD);
      this.transientViews.add(crystal);
      this.tweens.add({targets:crystal,y:y-47,angle:24,alpha:0,duration:750,onComplete:()=>{this.transientViews.delete(crystal);crystal.destroy();}});
      if(!e.autoSold&&rarity.rank>=2&&this.rewardCount<12) {
        const label=e.autoSold?`◆ +${Math.floor(e.value??0)} CR`:`◆ ${rarity.label} · ${e.item.name.slice(0,20)}`;
        const text=this.add.text(textX,textY,label,{fontFamily:'Noto Sans JP, sans-serif',fontSize:rarity.rank>=3?'14px':'12px',color,stroke:'#071321',strokeThickness:4}).setOrigin(.5).setDepth(15);
        this.transientViews.add(text);this.rewardCount++;
        this.tweens.add({targets:text,y:textY-38,alpha:0,delay:200,duration:1100,onComplete:()=>{this.transientViews.delete(text);text.destroy();this.rewardCount--;}});
      }
      if(rarity.rank>=2)this.rings.push({x,y,life:.45,max:.45,size:rarity.rank>=3?68:42,color:rarity.color});
    }
    if(e.kind==='overdrive') {
      this.rings.push({x:this.sim.player.x,y:this.sim.player.y,life:.65,max:.65,size:360,color:0x8deee7});
      this.cameras.main.shake(130,.0015);
    }
    if(e.kind==='module' || e.kind==='mastery' || e.kind==='inventory') {
      this.rings.push({x:this.sim.player.x,y:this.sim.player.y,life:.7,max:.7,size:105,color:MODULES.find(item=>item.id===this.sim.state.module)!.color});
    }
    if(this.sparks.length>400) this.sparks.splice(0,this.sparks.length-400);
    if(this.debris.length>70) this.debris.splice(0,this.debris.length-70);
    if(this.rings.length>60) this.rings.splice(0,this.rings.length-60);
    if(this.links.length>20) this.links.splice(0,this.links.length-20);
  }

  private showCombatRewards(events:GameEvent[]) {
    if(!this.sim.state.effects||this.reducedMotion||this.rewardCount>=10||this.transientViews.size>=92)return;
    const kills=events.filter(event=>event.kind==='kill'&&(event.value??0)>0);
    if(!kills.length)return;
    const boss=kills.some(event=>event.boss),elite=kills.some(event=>event.elite);
    const value=kills.reduce((total,event)=>total+(event.value??0),0);
    const x=Phaser.Math.Clamp(kills.reduce((total,event)=>total+(event.x??W/2),0)/kills.length,85,W-85);
    const y=kills.reduce((total,event)=>total+(event.y??320),0)/kills.length-18;
    const label=`+${Math.floor(value).toLocaleString('ja-JP')} CR${kills.length>1?`  /  ${kills.length}機`:''}`;
    const text=this.add.text(x,y,label,{fontFamily:'Consolas, Noto Sans JP, monospace',fontSize:boss?'21px':elite?'16px':'13px',color:boss?'#ffe6a3':'#e6cfa0',stroke:'#071321',strokeThickness:3}).setOrigin(.5).setDepth(15);
    this.transientViews.add(text);this.rewardCount++;
    this.tweens.add({targets:text,y:y-(boss?70:46),alpha:0,delay:boss?200:40,duration:boss?1200:800,onComplete:()=>{this.transientViews.delete(text);text.destroy();this.rewardCount--;}});
  }

  private renderEffects(dt:number) {
    this.effects.clear();
    for(const link of this.links) {
      link.life-=dt;if(link.life<=0)continue;
      const alpha=link.life/link.max;
      this.effects.lineStyle(10,link.color,alpha*.11);this.effects.strokePoints(link.points,false);
      this.effects.lineStyle(3,link.color,alpha*.95);this.effects.strokePoints(link.points,false);
      this.effects.lineStyle(1,0xeeffff,alpha);this.effects.strokePoints(link.points,false);
    }
    this.links=this.links.filter(link=>link.life>0);
    for(const wisp of this.wisps) {
      wisp.life-=dt;if(wisp.life<=0)continue;
      const target=this.sim.player,factor=Math.min(1,dt*7),oldX=wisp.x,oldY=wisp.y;
      wisp.x+=(target.x-wisp.x)*factor;wisp.y+=(target.y-wisp.y)*factor;
      this.effects.lineStyle(7,0x79ffc0,wisp.life/wisp.max*.13);this.effects.lineBetween(oldX,oldY,wisp.x,wisp.y);
      this.effects.lineStyle(1.5,0xc6ffd8,wisp.life/wisp.max*.75);this.effects.lineBetween(oldX,oldY,wisp.x,wisp.y);
      this.effects.fillStyle(0x9cffa9,.85);this.effects.fillCircle(wisp.x,wisp.y,2.1);
    }
    this.wisps=this.wisps.filter(wisp=>wisp.life>0);
    for(const spark of this.sparks) {
      spark.life-=dt;spark.x+=spark.vx*dt;spark.y+=spark.vy*dt;spark.vx*=1-dt*1.3;spark.vy*=1-dt*1.3;
      if(spark.life<=0)continue;
      this.effects.lineStyle(spark.size,spark.color,spark.life/spark.max);
      this.effects.lineBetween(spark.x,spark.y,spark.x-spark.vx*.028,spark.y-spark.vy*.028);
    }
    this.sparks=this.sparks.filter(s=>s.life>0);
    for(const ring of this.rings) {
      ring.life-=dt;if(ring.life<=0)continue;
      this.effects.lineStyle(1.5,ring.color,ring.life/ring.max*.8);
      this.effects.strokeCircle(ring.x,ring.y,(1-ring.life/ring.max)*ring.size+5);
    }
    this.rings=this.rings.filter(r=>r.life>0);
    for(const fragment of this.debris) {
      fragment.life-=dt;fragment.x+=fragment.vx*dt;fragment.y+=fragment.vy*dt;fragment.angle+=fragment.spin*dt;
      if(fragment.life<=0)continue;
      const s=fragment.size,a=fragment.angle;
      const point=(r:number,offset:number)=>({x:fragment.x+Math.cos(a+offset)*r,y:fragment.y+Math.sin(a+offset)*r});
      const p1=point(s,0),p2=point(s*.8,2.1),p3=point(s*.5,4.2);
      this.effects.fillStyle(fragment.color,fragment.life/fragment.max);this.effects.fillTriangle(p1.x,p1.y,p2.x,p2.y,p3.x,p3.y);
      this.effects.lineStyle(.7,0xddeaf0,fragment.life/fragment.max*.55);this.effects.lineBetween(p1.x,p1.y,p2.x,p2.y);
    }
    this.debris=this.debris.filter(d=>d.life>0);
  }
}
