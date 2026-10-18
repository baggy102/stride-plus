import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Types } from 'mongoose';
import { ReportsService } from './reports.service';
import { Report } from './reports.schema';

const mockReportModel = { create: jest.fn() };

describe('ReportsService', () => {
  let service: ReportsService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [ReportsService, { provide: getModelToken(Report.name), useValue: mockReportModel }],
    }).compile();

    service = module.get(ReportsService);
    jest.clearAllMocks();
  });

  it('create — 신고자·대상·사유를 ObjectId로 저장', async () => {
    const reporter = '64b7f0c2a1b2c3d4e5f60710';
    const target = '64b7f0c2a1b2c3d4e5f60718';

    await service.create(reporter, { targetType: 'run', targetId: target, reason: 'spam' });

    expect(mockReportModel.create).toHaveBeenCalledWith({
      reporterId: new Types.ObjectId(reporter),
      targetType: 'run',
      targetId: new Types.ObjectId(target),
      reason: 'spam',
    });
  });
});
