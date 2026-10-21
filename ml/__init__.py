"""ML layer: the transparent site-scoring model for the Elmina canopy prioritiser.

ml.scoring_model  the model itself (features in, three scores + total out)
ml.run_scoring    writes weights.json and scores.geojson through backend.ml_io
ml.validation     consistency and stability checks (there are no ground-truth labels)
"""
