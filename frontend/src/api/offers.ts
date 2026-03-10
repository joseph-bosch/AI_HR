import api from './client';
import type { Offer, OfferGenerateRequest, OfferTemplate, TemplateCreate, TemplateUpdate } from '../types/offer';

export const offersApi = {
  generate: (data: OfferGenerateRequest) =>
    api.post<Offer>('/offers/generate', data).then(r => r.data),

  get: (id: string) =>
    api.get<Offer>(`/offers/${id}`).then(r => r.data),

  update: (id: string, data: { content?: string; offer_data?: Record<string, unknown> }) =>
    api.put<Offer>(`/offers/${id}`, data).then(r => r.data),

  approve: (id: string) =>
    api.post<Offer>(`/offers/${id}/approve`).then(r => r.data),

  downloadPdf: (id: string) =>
    api.get(`/offers/${id}/pdf`, { responseType: 'blob' }).then(r => r.data),

  listByJob: (jobId: string) =>
    api.get<Offer[]>(`/offers/job/${jobId}`).then(r => r.data),
};

export const templatesApi = {
  list: (department?: string) =>
    api.get<OfferTemplate[]>('/templates', { params: department ? { department } : {} }).then(r => r.data),

  get: (id: string) =>
    api.get<OfferTemplate>(`/templates/${id}`).then(r => r.data),

  create: (data: TemplateCreate) =>
    api.post<OfferTemplate>('/templates', data).then(r => r.data),

  update: (id: string, data: TemplateUpdate) =>
    api.put<OfferTemplate>(`/templates/${id}`, data).then(r => r.data),

  delete: (id: string) =>
    api.delete(`/templates/${id}`).then(r => r.data),
};
