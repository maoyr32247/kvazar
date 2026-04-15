#version 330 core
out vec4 FragColor;

in vec2 TexCoords;

uniform vec2 iResolution;
uniform vec3 cameraPosition;
uniform mat4 view;
uniform mat4 projection;
uniform samplerCube skybox;

const float rs = 0.5;   // радиус горизонта событий
const int steps = 800;
const float dt = 0.02;
uniform float iTime;

float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i + vec3(0, 0, 0)), 
                       hash(i + vec3(1, 0, 0)), f.x),
                   mix(hash(i + vec3(0, 1, 0)), 
                       hash(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(hash(i + vec3(0, 0, 1)), 
                       hash(i + vec3(1, 0, 1)), f.x),
                   mix(hash(i + vec3(0, 1, 1)), 
                       hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}


float diskMask(vec3 p, float innerR, float outerR, float thickness)
{
    float r = length(p.xz);

    // Проверка толщины
    if (abs(p.y) > thickness)
        return 0.0;

    // Проверка радиуса
    if (r < innerR || r > outerR)
        return 0.0;

    return 1.0;
}

// Плоский аккреционный диск
float disk(vec3 p, float innerR, float outerR)
{
    float r = length(p.xz);
    if(abs(p.y) > 0.02) return 100.0; // диск почти плоский
    float dOuter = r - outerR;
    float dInner = innerR - r;
    return max(dOuter, dInner);
}



// Raymarch 
vec4 raytrace(vec3 ro, vec3 rd, vec2 uv)
{   
    float transmittance = 1.0;
    bool diskBlocked = false;
    float opacity = 0.0;
    const int NUM_PARTICLES = 5;  // или 100 — регулируешь по производительности
    float energy = 1.0;
    bool hitBlackHole = false;
    vec3 color = vec3(0.0);   // накопленный свет
    vec3 p = ro;              // позиция луча
    vec3 dir = rd;            // направление луча

    for(int i = 0; i < steps; i++)
    {
        float r = length(p);
        if(r > 20.0) break;

        // =============================
        // 1. Горизонт событий
        // =============================
        if(r < rs*0.2){
            hitBlackHole = true;
            break;
        }

        // =============================
        // 2. Параметры диска
        // =============================
        float innerR = 1.0;
        float outerR = 5.5;
        float thickness = 0.05;

        // -----------------------------
        // 3. Вращение диска в реальном времени
        // -----------------------------
        float diskSpeed = 0.8;             // скорость вращения диска
        float spin = iTime * diskSpeed;    // угол вращения
        mat2 rotDisk = mat2(
            cos(spin), -sin(spin),
            sin(spin),  cos(spin)
        );

        // создаём вращённую позицию для диска
        vec3 pDisk = p;
        pDisk.xz = rotDisk * pDisk.xz;

        // длина и угол для спирали диска
        float rDiskRot = length(pDisk.xz);
        float angle = atan(pDisk.z, pDisk.x);

        // проверка попадания в диск
        float diskMask = smoothstep(thickness, 0.0, abs(pDisk.y)) *
                 smoothstep(innerR, innerR + 0.2, rDiskRot) *
                 (1.0 - smoothstep(outerR - 0.2, outerR, rDiskRot));

        if (diskMask > 0.0001)
        {   

            // -------------------------
            // 4. Спиральная структура через расстояние + шум
            // -------------------------
            vec3 diskP = pDisk; // позиция в диске
            
            // делаем «координаты» для шума
            vec3 nCoord = vec3(
                length(diskP.xz),      // радиус
                diskP.y,               // высота
                atan(diskP.z, diskP.x) // угол
            ) * 15.0;

            // многоуровневый шум для хлопьев
            //float d = noise(nCoord) * 0.4 + noise(nCoord * 2.5) * 0.2;

            // -------------------------
            // 5. Радиальное затухание
            // -------------------------
            float radialFade = 1.0 - smoothstep(innerR, outerR, length(diskP.xz));


            // -------------------------
            // 6. Температура (центр горячее)
            // -------------------------
            float heat = 1.5 / (length(diskP.xz)*length(diskP.xz) + 0.2);

            // -------------------------
            // 7. Цвет диска
            // -------------------------
            vec3 hotColor = mix(vec3(1.0, 0.05, 0.02),
                                vec3(1.0, 0.6, 0.01),
                                clamp(heat, 0.0, 1.0));
            // распределение цветов
            hotColor = mix(hotColor, vec3(1.0), pow(heat, 3.0)) ;

            // -------------------------
            // 8. Итоговое излучение диска
            // -------------------------
            float n1 = noise(nCoord) * 0.4;
            float n2 = noise(nCoord * 5.5) * 0.2;
            float n3 = noise(nCoord * 10.0) * 0.2; // дополнительный слой
            float d = n1 + n2 + n3;

            // вертикальная вариация хлопьев: добавляем небольшой шум по высоте
            float verticalVariation = 0.3 + 0.9 * exp(-pow(pDisk.y*2.0, 2.0));
            // хлопья
            float density = pow(1.0 - smoothstep(0.0, 1.5, d), 2.0) * verticalVariation ;
            density *= radialFade * 2.5; // более резкие “хлопья”

            float marchStep = 0.02; // можно меньше для точности
            
            // усиление краев
            float viewAngle = abs(dot(dir, vec3(0.0,1.0,0.0)));

            // интегрируем внутри диска несколько маленьких шагов вдоль луча
            for(int m = 0; m < 3; m++)
            {
                float absorba = density * 10.5;
                vec3 emission = hotColor * density * radialFade * heat * 10.0;

                float tau = absorba * marchStep;           // шаг затухания
                float alpha = 1.0 - exp(-tau);            // сколько света поглощено
                color += hotColor * density * alpha * transmittance ;                // добавляем излучение
                transmittance *= exp(-tau);               // уменьшаем оставшийся свет
                
            }
            
            // не даем лучам проходить сквозь диск
            if(energy < 0.09)
                break;

            
            float tau = density * marchStep;          // затухание по плотности
            transmittance *= exp(-tau);
            color += hotColor * (1.0 - transmittance) * marchStep;

            if(density > 0.15)
            {
                transmittance = 0.0;
                break;
            }

        }

        

        // =============================
        //  ФИЗИЧЕСКИЙ ДЖЕТ
        // =============================

        // -----------------------------
        // 1. Вращение джета в реальном времени
        // -----------------------------
        float jetSpeed = 75.0;           // скорость вращения джета
        float aj = iTime * jetSpeed;    
        mat2 rotJet = mat2(
            cos(aj), -sin(aj),
            sin(aj),  cos(aj)
        );

        // вращённая позиция для джета
        vec3 pJet = p;
        pJet.xz = rotJet * pJet.xz;

        float rJetRot = length(pJet.xz);  // радиус джета

        float signY = sign(pJet.y); // вверх = 1, вниз = -1
        float asymmetry = mix(0.7, 1.0, step(0.0, signY)); 

        float h = abs(pJet.y);            // высота
        float jetRadius = 0.15 + h*0.04; // сужающийся конус джета
        float maxHeight = 10.0;

        // проверка попадания в джет
        bool insideJet = rJetRot < jetRadius && h > rs && h < maxHeight;

        if (insideJet)
        {
            float rJet = length(p.xz);
            float h = abs(p.y);

            // форма: узкий конус
            float jetRadius = 0.005 + h * 0.03;

            // ЖЁСТКОЕ ядро
            float core = exp(-rJet * 40.0);

            //  оболочка
            float shell = smoothstep(jetRadius, jetRadius * 0.5, rJet);

            // итоговая плотность
            float density = core + shell * 0.3;

            // затухание по высоте
            density *= exp(-h * 0.2);

            //  слабый шум (очень важно!)
            float n = noise(p * 3.0 + iTime);
            density *= mix(0.8, 1.2, n);

            // цвет
            vec3 jetColor = mix(vec3(0.2,0.5,1.0), vec3(1.0), core);

            float falloff = 1.0 / (1.0 + rJet * 10.0);

            float brightness = 13.0 + core * 28.0;

            vec3 emission = jetColor * density * falloff * 2.0;

            color += emission * transmittance * dt* brightness;

            transmittance *= exp(-density * dt * 30.0);
        }

        // =============================
        // 10. Частицы с притяжением
        // =============================
        vec3 bhPos = vec3(0.0);
        float eventHorizon = rs; // радиус горизонта

        for(int pi = 0; pi < NUM_PARTICLES; pi++){
            float angle = float(pi)/float(NUM_PARTICLES) * 6.2831853;
            float baseRadius = 2.0 + 3.0*fract(sin(float(pi)*12.9898)*43758.5453);

            // движение к черной дыре
            float speed = 0.1;
            float radius = baseRadius - iTime*speed;

            // создаём стандартную позицию
            vec3 particlePos = vec3(
                cos(angle + iTime*0.5) * radius,
                sin(angle*2.0 + iTime) * 0.0,
                sin(angle + iTime*0.5) * radius
            );

            // если частица пересекла горизонт, заменяем на фиксированную точку
            if(radius <= eventHorizon){
                particlePos = vec3(rs, 0.0, 0.0); // все частицы замирают в одной точке
            }

            float d = length(p - particlePos);
            float particleRadius = 0.09;

            if(d < particleRadius){
                vec3 particleColor = vec3(1.0, 0.8, 0.5);
                float intensity = 1.0 - smoothstep(0.0, particleRadius, d);
                color += particleColor * intensity * 10.0;
                energy *= 0.9;
            }

        }

        
        // =============================
        // 9. Гравитационное искривление
        // =============================
        vec3 accel = normalize(-p) * (rs / (r*r));// Шварцшильд радиус rs
        dir += accel * dt;
        dir = normalize(dir);

        p += dir * dt;

        float r2 = r * 40;

        // защита от деления на 0
        r2 = max(r2, 0.001);

        // цвет свечения центра
        vec3 glowColor = vec3(1.0, 0.9, 0.7);

        float rLen = length(p);

        color += glowColor * (0.1 / r2) * 0.002;

    }

    // =============================
    // 10. Фон и его проблемы $_$
    // =============================
    
    vec3 finalColor = color;

    if(!hitBlackHole) {
        vec3 bg = texture(skybox, dir).rgb;
        finalColor = color + bg * transmittance  ;
    }


    // =============================
    // 11. Tone mapping
    // =============================
    finalColor = 1.0 - exp(-finalColor * 1.8);
    finalColor = pow(finalColor, vec3(0.25));

    return vec4(finalColor,1.0);
}

void main()
{
    vec2 uv = (gl_FragCoord.xy / iResolution) * 2.0 - 1.0;
    uv.x *= iResolution.x / iResolution.y;

    // Строим направление луча через матрицу камеры
    mat3 invView = mat3(inverse(view));
    vec3 forward = normalize(invView * vec3(0.0, 0.0, -1.0));
    vec3 right   = normalize(invView * vec3(1.0, 0.0, 0.0));
    vec3 up      = normalize(invView * vec3(0.0, 1.0, 0.0));

    float fov = 45.0;
    float scale = tan(radians(fov * 0.5));

    vec3 rd = normalize(
        forward +
        uv.x * scale * right +
        uv.y * scale * up
    );

    vec3 ro = cameraPosition;

    FragColor = raytrace(ro, rd, uv);
}