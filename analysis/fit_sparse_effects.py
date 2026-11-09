#!/usr/bin/env python3
"""Exploratory sparse-effects analysis for randomized combinatorial plate experiments.

Install: python3 -m pip install pandas numpy scikit-learn
Run: python3 analysis/fit_sparse_effects.py --matrix sparse_model_matrix.csv \
       --measurements measurements_template.csv --outdir analysis_output

Fill the response column of the measurements file after the experiment.
This estimates a sparse additive + pairwise interaction model, not validated synergy
or a compressed-sensing recovery guarantee. Experimental confirmation is required.
"""
import argparse
import json
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--matrix', required=True, type=Path)
    parser.add_argument('--measurements', required=True, type=Path)
    parser.add_argument('--outdir', type=Path, default=Path('analysis_output'))
    parser.add_argument('--baseline', choices=['none', 'untreated', 'vehicle'], default='none',
                        help='Subtract per-plate mean control response before fitting. Default none.')
    args = parser.parse_args()
    try:
        import numpy as np
        import pandas as pd
        from sklearn.linear_model import LassoCV, Lasso
        from sklearn.metrics import r2_score, mean_squared_error
        from sklearn.model_selection import GroupKFold, KFold, cross_val_predict
        from sklearn.pipeline import make_pipeline
        from sklearn.preprocessing import StandardScaler
    except ImportError as exc:
        raise SystemExit('Missing dependency: python3 -m pip install pandas numpy scikit-learn') from exc

    Xfile = pd.read_csv(args.matrix)
    Yfile = pd.read_csv(args.measurements)
    keys = ['plate', 'well']
    required = set(keys + ['status', 'control_type'])
    if not required.issubset(Xfile) or not set(keys + ['response']).issubset(Yfile):
        raise SystemExit('Invalid inputs. Use the exported model matrix and measurements template.')
    if Xfile.duplicated(keys).any() or Yfile.duplicated(keys).any():
        raise SystemExit('Duplicate plate/well coordinates in one of the CSV files.')
    Yfile['response'] = pd.to_numeric(Yfile['response'], errors='coerce')
    if Yfile['response'].notna().sum() < 6:
        raise SystemExit('Enter numeric outcome measurements into the response column first (at least 6).')
    merged = Xfile.merge(Yfile[keys+['response']], on=keys, how='left', validate='one_to_one')
    treatment = merged.loc[merged.status.eq('treatment')].copy()
    if treatment['response'].isna().any():
        missing = treatment.loc[treatment.response.isna(), keys].head().to_dict('records')
        raise SystemExit(f'Missing numeric responses for treatment wells, such as {missing}.')
    controls = merged[merged.status.eq('control')].copy()
    baseline = {}
    if args.baseline != 'none':
        match = controls[controls.control_type.eq(args.baseline)].dropna(subset=['response'])
        baseline = match.groupby('plate')['response'].mean().to_dict()
        if set(treatment.plate) - set(baseline):
            raise SystemExit('Requested baseline control type is missing on one or more plates.')
        treatment['response'] -= treatment['plate'].map(baseline)
    features = [c for c in Xfile if c.startswith('main__') or c.startswith('pair__')]
    if not features:
        raise SystemExit('No drug-effect features found in sparse model matrix.')
    data = treatment[features].astype(float)
    # Remove features that do not vary in measured treatments; coefficients are not identifiable.
    active = [c for c in features if data[c].nunique()>1]
    if not active: raise SystemExit('No varying drug-dose features. Generate a more diverse experiment.')
    X=data[active].to_numpy(dtype=float)
    y=treatment['response'].to_numpy(dtype=float)
    if not np.isfinite(X).all() or not np.isfinite(y).all():
        raise SystemExit('All treatment features and measurements must be finite.')
    groups = treatment['combination_id'].astype(str).to_numpy()
    unique_groups = len(set(groups))
    if unique_groups < 5: raise SystemExit('At least five independent treatment combinations are recommended for CV.')
    folds = min(5, unique_groups)
    group_split = GroupKFold(n_splits=folds)
    cv_splits = list(group_split.split(X, y, groups))
    pipe = make_pipeline(StandardScaler(), LassoCV(cv=cv_splits, max_iter=40000, random_state=1701))
    pipe.fit(X,y)
    scaler = pipe.named_steps['standardscaler']
    lasso = pipe.named_steps['lassocv']
    # Recover coefficients on original 0/1 feature scale.
    coefficients = lasso.coef_ / scaler.scale_
    intercept = float(lasso.intercept_ - np.dot(scaler.mean_, coefficients))
    out = args.outdir
    out.mkdir(parents=True, exist_ok=True)
    pd.DataFrame({'feature':active,'effect_coefficient':coefficients,
                  'selected':np.abs(coefficients)>1e-10}).sort_values('effect_coefficient', key=abs, ascending=False).to_csv(out/'sparse_coefficients.csv',index=False)
    pred_cv = cross_val_predict(make_pipeline(StandardScaler(),Lasso(alpha=lasso.alpha_,max_iter=40000)),
                                X, y, cv=cv_splits)
    treatment['observed_response_adjusted'] = y
    treatment['predicted_response_in_sample'] = pipe.predict(X)
    treatment['predicted_response_cv'] = pred_cv
    treatment[keys+['control_type','combination_id','replicate','observed_response_adjusted',
                   'predicted_response_in_sample','predicted_response_cv']].to_csv(out/'treatment_predictions.csv',index=False)
    if not controls.empty:
        controls.groupby(['plate','control_type'],dropna=False)['response'].agg(['count','mean','std']).reset_index().to_csv(out/'control_summary.csv',index=False)
    summary = {'n_treatment_wells':int(len(treatment)), 'independent_treatment_combinations':int(unique_groups),
               'all_features':len(features),'varying_features':len(active),
               'selected_nonzero_coefficients':int(np.sum(np.abs(coefficients)>1e-10)),
               'alpha':float(lasso.alpha_), 'intercept':intercept,
               'cross_validated_r2':float(r2_score(y,pred_cv)),
               'cross_validated_rmse':float(np.sqrt(mean_squared_error(y,pred_cv))),
               'baseline_type':args.baseline, 'baseline_mean_by_plate':{str(k):float(v) for k,v in baseline.items()},
               'note':'Exploratory sparse additive/pairwise effect estimation, not proof of synergy or CS recovery.'}
    (out/'fit_summary.json').write_text(json.dumps(summary,indent=2)+'\n')
    print(json.dumps(summary,indent=2))
    print('Files written to',out)


if __name__ == '__main__':
    main()
