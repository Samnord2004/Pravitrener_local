from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List

from app.db.database import get_db
from app.api.deps import get_current_user
from app.models.user import User
from app.models.device import Device
from app.schemas.device import DeviceCreate, DeviceUpdate, DeviceOut
from app.schemas.measurement import MeasurementCreate, MeasurementOut

router = APIRouter(tags=["Устройства"])

@router.get("/", response_model=List[DeviceOut])
async def read_devices(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    skip: int = 0,
    limit: int = 100
):
    """Получить список устройств студии (админ видит все, остальные – свои)"""
    if current_user.role.upper() == "ADMIN":
        result = await db.execute(select(Device).offset(skip).limit(limit))
    else:
        result = await db.execute(
            select(Device).where(
                Device.tenant_id == current_user.tenant_id
            ).offset(skip).limit(limit)
        )
    devices = result.scalars().all()
    return devices

@router.post("/", response_model=DeviceOut, status_code=201)
async def create_device(
    device_in: DeviceCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Добавить новое устройство (только владелец или админ)"""
    if current_user.role.upper() not in ["OWNER", "ADMIN"]:
        raise HTTPException(status_code=403, detail="Недостаточно прав")
    
    # Проверяем уникальность MAC
    result = await db.execute(select(Device).where(Device.mac_address == device_in.mac_address))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Устройство с таким MAC уже существует")
    
    device = Device(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id if current_user.role.upper() == "COACH" else None,
        **device_in.model_dump()
    )
    db.add(device)
    await db.commit()
    await db.refresh(device)
    return device

@router.get("/{device_id}", response_model=DeviceOut)
async def read_device(
    device_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(
        select(Device).where(
            Device.id == device_id,
            (Device.tenant_id == current_user.tenant_id) | (current_user.role.upper() == "ADMIN")
        )
    )
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="Устройство не найдено")
    return device

@router.put("/{device_id}", response_model=DeviceOut)
async def update_device(
    device_id: str,
    device_in: DeviceUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(
        select(Device).where(
            Device.id == device_id,
            (Device.tenant_id == current_user.tenant_id) | (current_user.role.upper() == "ADMIN")
        )
    )
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="Устройство не найдено")
    
    update_data = device_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(device, field, value)
    
    await db.commit()
    await db.refresh(device)
    return device

@router.delete("/{device_id}", status_code=204)
async def delete_device(
    device_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role.upper() not in ["OWNER", "ADMIN"]:
        raise HTTPException(status_code=403, detail="Недостаточно прав")
    
    result = await db.execute(
        select(Device).where(
            Device.id == device_id,
            Device.tenant_id == current_user.tenant_id
        )
    )
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="Устройство не найдено")
    await db.delete(device)
    await db.commit()

# Эндпоинты для показаний
@router.post("/{device_id}/measurements", response_model=MeasurementOut, status_code=201)
async def create_measurement(
    device_id: str,
    measurement_in: MeasurementCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Записать показание с устройства (доступно тренеру, владельцу, админу)"""
    # Убедимся, что устройство существует и принадлежит текущему пользователю (по tenant)
    result = await db.execute(
        select(Device).where(
            Device.id == device_id,
            (Device.tenant_id == current_user.tenant_id) | (current_user.role.upper() == "ADMIN")
        )
    )
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="Устройство не найдено")
    
    from app.models.measurement import Measurement
    measurement = Measurement(
        device_id=device_id,
        **measurement_in.model_dump()
    )
    db.add(measurement)
    await db.commit()
    await db.refresh(measurement)
    return measurement

@router.get("/{device_id}/measurements", response_model=List[MeasurementOut])
async def read_measurements(
    device_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    skip: int = 0,
    limit: int = 100
):
    """Получить историю показаний устройства"""
    result = await db.execute(
        select(Device).where(
            Device.id == device_id,
            (Device.tenant_id == current_user.tenant_id) | (current_user.role.upper() == "ADMIN")
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Устройство не найдено")
    
    from app.models.measurement import Measurement
    result = await db.execute(
        select(Measurement)
        .where(Measurement.device_id == device_id)
        .order_by(Measurement.timestamp.desc())
        .offset(skip)
        .limit(limit)
    )
    measurements = result.scalars().all()
    return measurements
