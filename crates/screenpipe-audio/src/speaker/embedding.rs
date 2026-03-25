use anyhow::{Context, Result};
use ndarray::Array2;
use ort::session::Session;
use std::path::Path;

#[derive(Debug)]
pub struct EmbeddingExtractor {
    session: Session,
}

impl EmbeddingExtractor {
    pub fn new<P: AsRef<Path>>(model_path: P) -> Result<Self> {
        let session = super::create_session(&model_path)?;
        Ok(Self { session })
    }
    pub fn compute(&mut self, samples: &[f32]) -> Result<impl Iterator<Item = f32>> {
        let fbank = knf_rs::compute_fbank(samples)
            .map_err(anyhow::Error::msg)
            .context("compute_fbank failed")?;
        // knf-rs uses ndarray 0.16, convert to ndarray 0.17 by extracting raw data
        let shape = fbank.shape();
        let (rows, cols) = (shape[0], shape[1]);
        let raw_data: Vec<f32> = fbank.iter().copied().collect();
        let features = Array2::from_shape_vec((rows, cols), raw_data)
            .context("failed to reconstruct fbank array")?;
        let features = features.insert_axis(ndarray::Axis(0)); // Add batch dimension
        let inputs = ort::inputs! ["feats" => ort::value::TensorRef::from_array_view(features.view())?];

        let ort_outs = self.session.run(inputs)?;
        let ort_out = ort_outs
            .get("embs")
            .context("Output tensor not found")?
            .try_extract_array::<f32>()
            .context("Failed to extract tensor")?;

        // Collect the tensor data into a Vec to own it
        let embeddings: Vec<f32> = ort_out.iter().copied().collect();

        // Return an iterator over the Vec
        Ok(embeddings.into_iter())
    }
}
