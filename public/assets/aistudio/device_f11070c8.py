from pydantic import BaseModel, Field
from typing import Optional, List, Dict
from datetime import datetime

class DeviceBase(BaseModel):
    device_type: str = Field(..., description="Тип устройства")
    name: str = Field(..., description="Название")
    mac_address: str = Field(..., description="MAC-адрес")
    battery_level: Optional[int] = Field(None, description="Заряд батареи")
    notes: Optional[str] = Field(None, description="Примечания")

class DeviceCreate(DeviceBase):
    pass

class DeviceUpdate(BaseModel):
    name: Optional[str] = None
    battery_level: Optional[int] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None
    calibration_data: Optional[Dict] = None

class DeviceOut(DeviceBase):
    id: str
    tenant_id: str
    user_id: Optional[str] = None
    last_seen: Optional[datetime] = None
    is_active: bool
    calibration_data: Optional[Dict] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
