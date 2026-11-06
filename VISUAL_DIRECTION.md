# Visual direction

Graphical realism and immersion are high priorities for Tideline, as requested by the project owner on November 5, 2026. Preserve the complete, reliable single-player rescue mission while improving the visual experience.

Prioritize convincing materials at physical scale, natural silhouettes, human proportions and animation, plausible light sources and shadows, coherent environmental detail, and restrained interface/effects. Do not equate darkness, blur, excessive bloom, or high polygon counts with realism. Keep doorways, actors, cover and interaction prompts readable at night. Use the optional minimal HUD to reduce clutter without removing mission access.

The current renderer combines original procedural models with locally bundled CC0 scanned surface maps. It is still visibly simplified. The largest remaining visual gaps are character faces and animation, anatomically detailed hands, a production-quality weapon model and reload animation, convincing vegetation, and more varied architecture. Future work should favor those assets over adding map area or more simulation features.

Retain an offline runtime, documented asset provenance, an accessible graphics fallback, and browser visual verification. Do not introduce decorative geometry that appears to provide cover without matching gameplay collision. Existing small surface props are decorative; cover and wall geometry continue to come from the shared world model.
