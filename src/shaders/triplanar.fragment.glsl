uniform sampler2D uDiffuseMap;
uniform sampler2D uNormalMap;
uniform sampler2D uRoughnessMap;
uniform float uScale;
uniform vec3 uColor;

varying vec3 vNormal;
varying vec3 vWorldPosition;

// From Three.js standard lights
struct DirectionalLight {
    vec3 direction;
    vec3 color;
};
uniform DirectionalLight directionalLights[ NUM_DIR_LIGHTS ];
uniform vec3 ambientLightColor;

void main() {
    // 1. Calculate Triplanar Weights based on Normal
    vec3 blending = abs(vNormal);
    // Force weights to sum to 1.0
    blending /= (blending.x + blending.y + blending.z);

    // 2. Define UVs for all three projections
    // Using world position so it tiles perfectly regardless of sphere size
    vec2 xUV = vWorldPosition.zy * uScale;
    vec2 yUV = vWorldPosition.xz * uScale;
    vec2 zUV = vWorldPosition.xy * uScale;

    // 3. Sample the Diffuse Map
    vec4 texX = texture2D(uDiffuseMap, xUV);
    vec4 texY = texture2D(uDiffuseMap, yUV);
    vec4 texZ = texture2D(uDiffuseMap, zUV);

    // Blend the textures together based on the normal weights
    vec4 diffuseColor = texX * blending.x + texY * blending.y + texZ * blending.z;

    // Mix with base color if desired
    diffuseColor.rgb *= uColor;

    // 4. Sample the Normal Map (Simplified bump mapping for triplanar)
    // A true triplanar normal map requires tangent basis calculation per plane,
    // but for a rock surface, blending the color of the normal map and applying it to the vertex normal is a fast approximation.
    vec4 normX = texture2D(uNormalMap, xUV);
    vec4 normY = texture2D(uNormalMap, yUV);
    vec4 normZ = texture2D(uNormalMap, zUV);
    vec3 blendedNormalTex = (normX.xyz * blending.x + normY.xyz * blending.y + normZ.xyz * blending.z) * 2.0 - 1.0;

    // Perturb the vertex normal (approximate)
    vec3 finalNormal = normalize(vNormal + blendedNormalTex * 0.5);

    // 5. Sample the Roughness Map
    vec4 roughX = texture2D(uRoughnessMap, xUV);
    vec4 roughY = texture2D(uRoughnessMap, yUV);
    vec4 roughZ = texture2D(uRoughnessMap, zUV);
    float roughness = (roughX.r * blending.x + roughY.r * blending.y + roughZ.r * blending.z);

    // 6. Lighting Calculation (Diffuse + Specular Approximation)
    vec3 totalLight = ambientLightColor;
    vec3 viewDir = normalize(cameraPosition - vWorldPosition);

    #if NUM_DIR_LIGHTS > 0
        for( int i = 0; i < NUM_DIR_LIGHTS; i++ ) {
            vec3 lightDir = normalize( directionalLights[ i ].direction );

            // Diffuse (N dot L)
            float diff = max( dot( finalNormal, lightDir ), 0.0 );
            totalLight += directionalLights[ i ].color * diff;

            // Specular (Blinn-Phong Approximation based on roughness)
            vec3 halfDir = normalize(lightDir + viewDir);
            float specAngle = max(dot(finalNormal, halfDir), 0.0);
            float shininess = pow(2.0, (1.0 - roughness) * 10.0); // Convert roughness to shininess
            float specular = pow(specAngle, shininess) * (1.0 - roughness); // Dim specular based on roughness

            totalLight += directionalLights[ i ].color * specular;
        }
    #else
        // Fallback lighting if no lights exist
        float diff = max(dot(finalNormal, normalize(vec3(1.0, 1.0, 1.0))), 0.2);
        totalLight += vec3(1.0) * diff;
    #endif

    gl_FragColor = vec4(diffuseColor.rgb * totalLight, 1.0);
}
