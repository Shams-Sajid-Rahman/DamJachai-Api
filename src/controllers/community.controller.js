import * as community from '../services/community.service.js';

export async function createPriceReport(req, res) {
  res.status(201).json({ data: await community.createPriceReport(req.user.id, req.valid.body) });
}

export async function listMyPriceReports(req, res) {
  res.json({ data: await community.listMyPriceReports(req.user.id) });
}

export async function upsertReview(req, res) {
  const { review, created } = await community.upsertReview(req.user.id, req.valid.body);
  res.status(created ? 201 : 200).json({ data: review });
}

export async function getMyReview(req, res) {
  res.json({ data: await community.getMyReviewForLab(req.user.id, req.valid.params.labId) });
}

export async function listFavorites(req, res) {
  res.json({ data: await community.listFavorites(req.user.id) });
}

export async function addFavorite(req, res) {
  await community.addFavorite(req.user.id, req.valid.body.labId);
  res.status(201).json({ data: { labId: req.valid.body.labId, isFavorite: true } });
}

export async function removeFavorite(req, res) {
  await community.removeFavorite(req.user.id, req.valid.params.labId);
  res.status(204).end();
}
