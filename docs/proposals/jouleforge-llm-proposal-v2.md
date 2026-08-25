# Evidence-Grounded LLM Review for Physics-Based Design of Electrically Heated Reactors

**JouleForge AI Workbench | Research Proposal**

Yeonsu Kwak and Seongmin Kim

## Project Summary

Direct Joule heating supplies heat inside a reactor element through electrical resistance. Reactor design therefore couples thermal duty, electrical power limits, material resistivity, geometry, gas flow, pressure drop, temperature uniformity, catalyst compatibility, and high-temperature durability. JouleForge already has a fast physics-based 0D/2D solver that can evaluate these coupled variables. It calculates resistance, voltage, current, power, mean and maximum temperature, temperature nonuniformity, pressure drop, and hot-spot location for tube and foam reactor designs.

The remaining bottleneck is evidence outside the solver. A candidate can satisfy electrical and thermal constraints while failing because the material cannot be manufactured in the required form, lacks stability in the intended atmosphere, has uncertain high-temperature resistivity, develops a brittle phase, or has no practical procurement route. These constraints are distributed across literature, data sheets, and manufacturing knowledge. They depend on temperature, atmosphere, composition, geometry, time, and fabrication route. This project will develop an evidence-grounded large language model (LLM) layer that evaluates these constraints for candidates already screened by the solver.

## Objective and Central Hypothesis

The objective is to determine whether an LLM can improve early-stage decisions for directly Joule-heated reactors by screening solver-feasible candidates against material and manufacturing evidence. The central hypothesis is that an LLM can identify constraints missed by the thermal-electrical model and improve candidate prioritization when it operates on a curated evidence base, returns a fixed decision schema, and sends uncertainty ranges back through the solver. The project will initially compare commercial or established FeCrAl alloys, NiCr alloys, SiC or SiSiC elements, and metal foams.

## Technical Approach

The workflow begins with the physics screen. Inputs include the target and inlet temperatures, gas composition, flow rate, pressure, reaction duty, warm-up time, reactor dimensions, allowable pressure drop, electrical supply limits, and reactor architecture. The solver calculates the required heat duty and identifies material-geometry combinations that satisfy the voltage, current, power, temperature, and pressure-drop limits. It produces a structured design card for every surviving candidate. The card contains material identity and grade, form factor, geometry, porosity, electrical conditions, operating atmosphere, expected duration, solver predictions, and the property assumptions that control feasibility.

A curated evidence store will hold excerpts from literature, manufacturer data sheets, and validated internal measurements. Every record will include the material grade or composition, specimen form, property or failure mode, numerical value where available, units, temperature, atmosphere, duration, fabrication route, source identifier, and source location. Each datum will carry an evidence label: MEASURED, LITERATURE, CALCULATED, ML_PREDICTED, or ASSUMED. This distinction controls how the solver treats uncertainty. A bulk-alloy resistivity measured on a dense coupon, for example, cannot receive the same confidence as resistance measured on the actual foam device.

The LLM will receive one design card and the retrieved evidence relevant to it. It will return a machine-readable assessment containing: the applicability of each evidence item; binding constraints; evidence-supported uncertainty ranges; evidence gaps; and required measurements. The LLM will cite the supplied evidence identifiers for every conclusion. It will return NEEDS_MEASUREMENT when the evidence does not support a numerical range or a stability claim. This constraint prevents unsupported material-property generation.

Python will pass every evidence-supported uncertainty range back to the physics solver. If a FeCrAl foam candidate has an effective-resistivity multiplier supported over a finite range, the solver will rerun the candidate at both limits and throughout the relevant range. A candidate will receive PASS when it remains within the electrical supply, temperature, and pressure-drop limits across the range. It will receive HOLD when feasibility changes with an unmeasured property. It will receive FAIL when the evidence establishes a material, manufacturing, or safety constraint that rules out the candidate.

## Implementation and Decision Logic

The initial implementation will use four Python functions: `solve(candidate)`, `retrieve_evidence(candidate)`, `review(candidate, evidence)`, and `rerun_uncertainty(candidate, review)`. The solver will screen thousands of low-dimensional material-geometry combinations before any LLM call. The retrieval function will select evidence by material family, temperature, atmosphere, specimen form, and failure mode. The review function will call the LLM with a constrained prompt and a JSON schema. The schema will require a decision status, a list of binding constraints, evidence identifiers, confidence level, uncertainty parameters, supported ranges, and required measurements. A schema validator will reject malformed output, citations absent from the input packet, and values outside defined parameter ranges.

The decision gate will separate hard exclusions from uncertainty-sensitive cases. Hard exclusions include a documented atmosphere incompatibility, an unavailable manufacturing route, or an electrical or thermal safety violation. Uncertainty-sensitive cases will proceed to a sensitivity calculation. For example, the LLM may identify a plausible range for foam contact resistance or effective resistivity. The solver will evaluate the range against the target power and temperature constraints. This calculation establishes whether the uncertainty changes the design decision. The experimental request will then focus on the property whose measurement has the greatest potential to change the selected candidate.

The system will preserve provenance at every step. A final design report will link the original process requirement to the candidate definition, solver assumptions, evidence records, LLM review, sensitivity runs, final status, and proposed validation test. This record enables an engineer to inspect the source of a recommendation and revise an assumption without repeating the entire workflow. It also creates a growing internal dataset of candidate designs, evidence gaps, measurements, and verified outcomes.

## Validation and Deliverables

Validation will begin with five baseline candidates: FeCrAl tube, FeCrAl foam, NiCr element, SiC tube, and stainless-steel foam. The candidates will be compared under matched heat-duty and power-supply conditions. A domain expert will independently review the same evidence packets and classify each candidate as feasible, infeasible, or requiring measurement. Evaluation will quantify evidence-citation accuracy, detection of condition mismatch, detection of missing evidence, agreement on the next measurement, and unsupported numerical claims.

A small set of high-priority candidates will then undergo coupon and nonreactive heater tests. Measurements will include resistance from room temperature through the intended operating range, resistance drift during thermal cycling, electrical contact behavior, temperature fields, and post-test material condition. These experiments will test whether the uncertainty ranges and feasibility classifications identified by the workflow match physical behavior.

The project will deliver a reusable Python workflow containing the Joule-heating solver interface, structured evidence database, LLM review module, uncertainty-propagation module, decision gate, and auditable design report. The resulting method will establish whether language-model interpretation of materials evidence can improve the selection of reactor elements that merit fabrication and reactor testing.

---

*Converted from `JouleForge_LLM_Proposal_v2.docx`. Text is verbatim; only formatting is markdown. Review notes are kept separately rather than inline so this file stays a faithful copy of the source.*
